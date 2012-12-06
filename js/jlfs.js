/*
 * TL;DR: 2-clause BSD
 *
 * Copyright (c) 2011, Coriolis Technologies Pvt Ltd. All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.  
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 * 
 */

var include = function (filename) {
    document.write('<script type="text/javascript" src="' + filename + 
        '"><' + '/script>');
}
include('js/util.js');


/* Constants - need to keep in sync with jlfs driver */
function JL() {}
JL.JLFS_CMD_IRQACK = 0x1;
JL.JLFS_CMD_TEST = 0x2;
JL.JLFS_CMD_READ = 0x3;
JL.JLFS_CMD_WRITE = 0x4;
JL.JLFS_CMD_READDIR = 0x5;
JL.JLFS_CMD_STAT = 0x6;
JL.JLFS_STATUS_OK = 0xa0a0;
JL.JLFS_STATUS_UNKNOWN_CMD = 0xa0a1;
JL.JLFS_STATUS_NOK = 0xa0a2;
JL.JLFS_STATUS_ENOENT = 0x2;
JL.JLFS_STATUS_EIO = 0x5;
JL.PAGE_SIZE = 4096;
JL.files = [];
JL.ready = false;
JL.readystr = "f1c0ffee: initialized";
JL.readylistener = function() {};

/*
 * "Hypervisor"-side device counterpart of the jlfs driver in the kernel.
 *
 * jlfs tells us the location of two pages to be used for passing arguments
 * and results. Only 3 ops are implemented: readdir, stat and read, which are
 * enough for a one-level readonly filesystem. Arguments and results are in a
 * pidgin JSON which can be parsed by sscanf. Yeah, mipela roscol.
 */

function JLHost(pc, port, set_irq_func) {
    this.statusreg = 0;
    this.requestbuf = 0; // Physical address of parameter page, written by jlfs
    this.resultbuf = 0; // Physical address of result page, written by us
    this.requeststr = "";
    this.readaddr = 0;
    this.readlen = 0;
    
    this.set_irq_func = set_irq_func;
    this.pc = pc;
    pc.register_ioport_write(port, 16, 4, this.ioport_writel.bind(this));
    pc.register_ioport_read(port, 16, 4, this.ioport_readl.bind(this));
}

// Read string from physical memory
JLHost.prototype.read_string = function(addr) {
    var resultstr = new String;
    var c = 0;
    for (var i = 0; i < JL.PAGE_SIZE; i++) {
        c = this.pc.cpu.ld8_phys(addr + i);
        if (c == 0) {
            break;
        }
        resultstr += String.fromCharCode(c);
    }
    return resultstr;
}

JLHost.prototype.read_normal = function(file, obj) {
    var reader = new FileReader();
    reader.jlHost = this;

    // If we use onloadend, we need to check the readyState.
    reader.onload = function(evt) {
        var res = evt.target.result;
        if (evt.target.readyState == FileReader.DONE) { // DONE == 2
            for (var i = 0; i < res.length; i++) {
                this.jlHost.pc.cpu.st8_phys(this.jlHost.readaddr + i, res.charCodeAt(i)&0xff);
            }
            res = '{"read":' + evt.target.result.length + '}';
            this.jlHost.pc.cpu.write_string(this.jlHost.resultbuf, res);
            this.jlHost.statusreg = JL.JLFS_STATUS_OK;
            this.jlHost.set_irq_func(1);
        }
    };

    reader.onerror = function(evt) {
        Util.Info(">> CMD_READ onerror " + evt.target.error.code);
        switch(evt.target.error.code) {
          case evt.target.error.NOT_FOUND_ERR:
            this.jlHost.statusreg = JL.JLFS_STATUS_ENOENT;
            break;
          case evt.target.error.NOT_READABLE_ERR:
            this.jlHost.statusreg = JL.JLFS_STATUS_EIO;
          case evt.target.error.ABORT_ERR:
            this.jlHost.statusreg = JL.JLFS_STATUS_EIO;
            break; // noop
          default:
            this.jlHost.statusreg = JL.JLFS_STATUS_EIO;
        };
        this.jlHost.set_irq_func(1);
    }

    var blob;
    if (file.webkitSlice) {
        blob = file.webkitSlice(obj.offset, obj.offset + obj.len);
    } else if (file.mozSlice) {
        blob = file.mozSlice(obj.offset, obj.offset + obj.len);
    } else if (file.slice) { /* Opera */
        blob = file.slice(obj.offset, obj.len);
    }
    reader.readAsBinaryString(blob);
}

JLHost.prototype.cmd = function (cmdid) {
    //Util.Info(">> JLHost cmd " + cmdid);
    switch (cmdid) {
        case JL.JLFS_CMD_IRQACK:
           this.statusreg = 0;
           this.set_irq_func(0); 
           break;

        case JL.JLFS_CMD_TEST:
            Util.Info(">> CMD_TEST");
            this.pc.cpu.write_string(this.resultbuf, "JLHost: Test Command Successful");
            this.statusreg = JL.JLFS_STATUS_OK;
            this.set_irq_func(1);
            break;

        case JL.JLFS_CMD_READDIR:
            var args = this.read_string(this.requestbuf);
            Util.Info(">> CMD_READDIR " + args);
            var obj = $.parseJSON(args);
            if (obj.pos + 1 > JL.files.length) {
                this.statusreg = JL.JLFS_STATUS_ENOENT;
            } else {
                var inum = obj.pos + 1;
                var res = '{ "inode":' + inum + ',"name":"' + JL.files[obj.pos].name.replace(/ /g, "/") + '"}';
                this.pc.cpu.write_string(this.resultbuf, res);
                this.statusreg = JL.JLFS_STATUS_OK;
            }
            Util.Info(">> CMD_READDIR " + res);
            this.set_irq_func(1);
            break;

        case JL.JLFS_CMD_STAT:
            var args = this.read_string(this.requestbuf);
            //Util.Info(">> CMD_STAT " + args);
            var obj = $.parseJSON(args);
            var res = "";
            var fname = obj.file.replace(/\//g, "");
            //Util.Info(">> CMD_STAT file " + fname);
            for (var i = 0, f; f = JL.files[i]; i++) {
               // Util.Info(">> CMD_STAT files " + i + " " + f.name);
                if (f.name == fname) {
                    var mtime = f.lastModifiedDate;
                    res += '{"inode":' + (i+1) + ',"size":' + f.size + ',"mtime_sec":' + Math.floor(mtime ? mtime.getTime() / 1000.0 : 0) + ',"mtime_nsec":' + Math.floor(((mtime ? mtime.getTime() % 1000.0 : 0)) * 1000.0) + '}';
                    this.pc.cpu.write_string(this.resultbuf, res);
                    this.statusreg = JL.JLFS_STATUS_OK;
                    this.set_irq_func(1);
                    return;
                }
            }
            this.statusreg = JL.JLFS_STATUS_ENOENT;
            this.set_irq_func(1);
            break;

        case JL.JLFS_CMD_READ:
            var args = this.read_string(this.requestbuf);
            //Util.Info(">> CMD_READ " + args);
            var obj = $.parseJSON(args);
            var res = "";
            var fname = obj.file.replace(/\//g, "");
            var file = JL.files[obj.fd - 1];
            //Util.Info(">> CMD_READ file " + fname);
            if (obj.fd > JL.files.length) {
                this.statusreg = JL.JLFS_STATUS_ENOENT;
                this.set_irq_func(1);
                return;
            }
            if (fname != file.name) {
                //Util.Info(">> CMD_READ file mismatch " + fname + " " + file.name);
                this.statusreg = JL.JLFS_STATUS_EIO;
                this.set_irq_func(1);
                return;
            }
            this.readaddr = obj.addr;
            this.readlen = obj.len;
            this.read_normal(file, obj);

            break;

        default:
           this.statusreg = JL.JLFS_UNKNOWN_CMD;
           this.set_irq_func(1); 
           break;
    }
}       

JLHost.prototype.ioport_writel = function (ia, ja) {

    //Util.Info(">> JLHost write " + ja);
    ia &= 15; // Compute offset by removing base addr of the port.
    switch (ia) {
    default:
    case 0:
        //Util.Debug(">> port write BASE:" + ja);
        break;
    case 4:
        //Util.Debug(">> port write CMD: " + ja);
        this.cmd(ja);
        break;
    case 8:
        //Util.Debug(">> port write REQUESTBUF:" + ja);
        this.requestbuf = ja;
        break;
    case 12:
        //Util.Debug(">> port write RESULTBUF:" + ja);
        this.resultbuf = ja;
        break;
    }
}

JLHost.prototype.ioport_readl = function (ia) {
    var hf;
    //Util.Info(">> JLHost read:" + ia);
    ia &= 15; // Compute offset by removing base addr of the port.
    switch (ia) {
    default:
    case 0:
        //Util.Debug(">> port read JLFS_IO_BASE");
        hf = 0xf1c0ffee;
        break;
    case 4:
        //Util.Debug(">> port read JLFS_IO_READ_STATUS");
        hf = this.statusreg;
        break;
    }
    return hf;
}

function WShell() {
//    this.jlhost = new JLHost(pc, 0x180, pc.pic.set_irq.bind(pc.pic, 5));
    this.efbridge = new EFBridge();
//    this.pc = pc;
//    pc.jshell = this;
//    this.serial = new Uart(pc, 0x2f8, pc.pic.set_irq.bind(pc.pic, 3), this.output.bind(this));
    this.cmd_inprogress = null;
    this.queue = [];
    this.obuffer = '';
    JL.ready = true;
    JL.readylistener();
}

var SLT_OUTPUT_END_MARKER = '<><><><><>';

WShell.prototype.cmd = function(str) {
    Util.Debug('>> cmd ' + str);
    var dfrd = $.Deferred();
    dfrd.abort = function(jsh) {
        /*
         * Subtle! We send a ^C if we're the command in progress, but DON'T
         * take it off the inprogress slot. So the following command will
         * wait until this command terminates and sends an output()
         */
        if (this === jsh.cmd_inprogress) {
            //jsh.pc.serial.send_chars(String.fromCharCode(3));
            console.log("Try to send Ctrl-C");
        }
        this.reject('abort');
    }.bind(dfrd, this);
    dfrd.fire = function(jsh, s) {
        //jsh.pc.serial.send_chars(s + '\n');
        console.log("Send command : " + s);
        vmxworker.postMessage({'type': 'send', 'data': s});
    }.bind(dfrd, this, str);
    if (this.cmd_inprogress) {
       this.queue.unshift(dfrd);
    } else {
        this.cmd_inprogress = dfrd;
        dfrd.fire();
    }
    return dfrd;
}

WShell.prototype.output = function(str) {
    //Util.Debug('>> output' + str);
    if (!JL.ready && str.replace(/\s+$/, '') == JL.readystr) {
        JL.ready = true;
        JL.readylistener();
        return;
    }
    if (this.cmd_inprogress && !this.cmd_inprogress.isRejected()) {
        // Pass results, unless we had aborted the command
        //this.cmd_inprogress.resolve(str);
        if(str.indexOf(SLT_OUTPUT_END_MARKER) >=0) {
            this.cmd_inprogress.resolve(this.obuffer);
            this.obuffer = '';
            while (JL.ready && (this.cmd_inprogress = this.queue.pop())) {
                if (!this.cmd_inprogress.isRejected() && !this.cmd_inprogress.isResolved()) {
                    this.cmd_inprogress.fire();
                    break;
                }

            }
        }
        else
            this.obuffer += str;

    }
    //while (JL.ready && (this.cmd_inprogress = this.queue.pop())) {
        //if (!this.cmd_inprogress.isRejected() && !this.cmd_inprogress.isResolved()) {
            //this.cmd_inprogress.fire();
            //break;
        //}
    //}
}

function EFBridge() {
    this.cache = {}; // cache of file stat data
}

EFBridge.CACHE_FILEDATA_MAX = 1024 * 100;
EFBridge.sleuthkit_opts = {vmdk: ['-i', 'QEMU'], vdi: ['-i', 'QEMU'], qcow2: ['-i', 'QEMU']}
EFBridge.filter_entries = [/^\$/];

EFBridge.prototype.cmd = function(options) {
    Util.Debug('>> transport send ' + JSON.stringify(options.data));
    switch (options.data.cmd) {
        case 'open':
            if (options.data.init == 1) {
                this.cache = {};
                return this.open('ROOT');
            } else {
               return this.open(options.data.target);
            }
            break;
        case 'get':
            return this.get(options.data.target);
            break;
        case 'parents':
            return this.parents(options.data.target);
        default:
            return $.Deferred().reject('Unknown command');
            break;
    }
}

EFBridge.prototype.parents = function(hash) {
// Not yet known to work!
		var parents = [],
			dir,
            dfrd = $.Deferred();
		
        if (!(hash in this.cache)) {
            dfrd.reject('orphan');
            return dfrd;
        }
        hash = this.cache[hash].phash;
        while (hash && (dir = this.cache[hash])) {
            parents.unshift(dir.cwd);
            hash = dir.phash;
        }
        dfrd.resolve({tree: parents});
		return dfrd;
}

EFBridge.prototype.opendone = function(target, dfrd, result) {
    Util.Debug('>>EFB opendone ' + result);
    if (!result) {
        dfrd.status = 404;
        dfrd.reject(dfrd, 'open');
        return;
    }
    var lines = result.split(/\n/);
    var cwd;
    if (target == 'ROOT') {
        cwd = {name: JL.files[0].name, hash: "ROOT", phash: "", date: "30 Jan 2010 14:25", mime: "directory", size: 0, read: 1, write: 1, locked: 0, volumeid: JL.files[0].name};
        this.cache[cwd.hash] = $.extend(true, {}, cwd);
    } else {
        cwd = $.extend(true, {}, this.cache[target]);
        //cwd = {name: comp[2], hash: target, phash: comp.slice(3).join('/'),
         //       mime: "directory", size: 0, read: 1, write: 1, locked: 0};
    }
    var files = new Array();
    var subdir_exists = false;
    for (var i = 0; i < lines.length; i++) {
        var m = /(.)\/(\w)\s+([^:]+):\t(.*?)\t(.*?)\t(.*?)\t(.*?)\t(.*?)\t(\d+)\t(\d+)\t(\d+)/.exec(lines[i]);
        if (m) {
            var filter = false;
            for (var j = 0; j < EFBridge.filter_entries.length; j++) {
                if (m[4].match(EFBridge.filter_entries[j])) {
                    filter = true;
                    break;
                }
            }
            if (filter) {
                continue;
            }
            if (m[4] == ".") {
                if (target == 'ROOT') {
                    cwd.hash = 'h' + m[3];
                    this.cache[cwd.hash] = $.extend(true, {}, cwd);
                }
                continue;
            }
            if (m[4] == "..") {
                /*
                if (target != 'ROOT') {
                    cwd.phash = m[3];
                }
                */
                continue;
            }
            var ext = m[4].slice(m[4].lastIndexOf('.') + 1);
            var mime = this.mime_map[ext.toLowerCase()] || 'text/plain';
            var file = {name: m[4], hash: 'h' + m[3], phash: cwd.hash,
                date: m[5], mime: (m[2] == 'd') ? 'directory' : mime,
                size: m[9], read: 1, write: 1, locked: 0};
            files.push(file);
            this.cache[file.hash] = file;
            if (m[2] == 'd') {
                subdir_exists = true;
            }
        }
    }
    if (subdir_exists) {
        cwd.dirs = 1;
    }

    files.unshift($.extend(true, {}, cwd));
    this.cache[cwd.hash].cwd = $.extend(true, {}, cwd);
    this.cache[cwd.hash].files = $.extend(true, [], files);

    var options = { archivers: { create: [], extract: [] },
                    copyOverwrite: 1,
                    disabled: [],
                    path: "Test path",
                    separator: "/",
                    tmbUrl: "",
                    url: ""
    }
    var ret = {cwd: $.extend(true, {}, cwd), files: $.extend(true, [], files), options: options, uplMaxSize: "1M"};
    if (target == 'ROOT') {
        ret.api = "2.0";
    }
    Util.Debug('>> transport send ' + JSON.stringify(ret));
    dfrd.resolve(ret);
}

EFBridge.prototype.open = function(target) {
    var dfrd = $.Deferred();

    var ct = this.cache[target];
    if (!ct && target != 'ROOT') {
        dfrd.status = 404;
        dfrd.reject(dfrd, 'target not in cache?!');
        return dfrd;
    }
    if (ct && ct.cwd) {
        var options = { archivers: { create: [], extract: [] },
                        copyOverwrite: 1,
                        disabled: [],
                        path: "Test path",
                        separator: "/",
                        tmbUrl: "",
                        url: ""
        }
        var ret = {cwd: $.extend(true, {}, ct.cwd), files: $.extend(true, [], ct.files), options: options, uplMaxSize: "1M"};
        //Util.Debug('>> efbridge open cache hit: ' + JSON.stringify(ret));
        dfrd.resolve(ret);
        return dfrd;
    }
        
    var image = JL.files[0].name;
    var ext = image.slice(image.lastIndexOf('.') + 1);
    var opt = EFBridge.sleuthkit_opts[ext.toLowerCase()] || ['-a'];
    var cmd = opt.slice();
    
    if (target != 'ROOT') {
        cmd.push('-I'); 
        cmd.push(target.slice(1));
    }
    cmd.push.apply(cmd, ['-v', '-l', image]);
    Util.Debug('>>EFB open ' + cmd);
    var jshd = jshell.cmd(cmd)
        .done(this.opendone.bind(this, target, dfrd))
        .fail(function(df) {
            return function(status) {
                df.reject(df, status);
            }
        }(dfrd));
    dfrd.abort = jshd.abort;
    return dfrd;
}

EFBridge.prototype.getdone = function(target, dfrd, result) {
    //Util.Debug('>>EFB getdone ' + result);
    if (!result) {
        dfrd.status = 404;
        dfrd.reject(dfrd, 'No result from get');
        return;
    }
    if (target == 'osinfo') {
        result = osinfo_convert(result);
    }
    if (result.length < EFBridge.CACHE_FILEDATA_MAX) {
        this.cache[target].data = result;
    }
    
    dfrd.resolve({content: result});
}

EFBridge.prototype.get = function(target) {
    var dfrd = $.Deferred();
 
    if (target == 'osinfo' && !this.cache[target]) {
        var h = {name: "osinfo", hash: "osinfo", phash: "", date: "30 Jan 2010 14:25", mime: "text/html", size: 1024, read: 1, write: 1, locked: 0, volumeid: JL.files[0].name};
        this.cache[target] = $.extend(true, {}, h);
    }

    var ct = this.cache[target];
    if (!ct || ct.mime == 'directory') {
        dfrd.status = 403;
        dfrd.reject(dfrd, 'get: invalid target');
        return dfrd;
    }
    if (ct.data) {
     //   Util.Debug('>> efbridge get cache hit: ' + JSON.stringify(ct.data));
        dfrd.resolve({content: ct.data});
        return dfrd;
    }
        
    if (!ct.size) {
        dfrd.resolve({content: ''});
        return dfrd;
    }
 
    var image = JL.files[0].name,
        ext = image.slice(image.lastIndexOf('.') + 1),
        opt = EFBridge.sleuthkit_opts[ext.toLowerCase()] || [],
        gopt = (target == 'osinfo') ? ['-t'] : ['-c', '-I', target.slice(1)];

    var cmd = gopt.slice().concat(opt, [image]); 

    //Util.Debug('>>EFB get ' + cmd);
    var jshd = jshell.cmd(cmd)
    .done(this.getdone.bind(this, target, dfrd))
    .fail(function(df) {
        return function(status) {
            df.reject(df, status);
        }
    }(dfrd));
    dfrd.abort = jshd.abort;
    return dfrd;
}


EFBridge.prototype.mime_map = {
		// applications
		ai    : 'application/postscript',
		eps   : 'application/postscript',
		exe   : 'application/x-executable',
		doc   : 'application/vnd.ms-word',
		xls   : 'application/vnd.ms-excel',
		ppt   : 'application/vnd.ms-powerpoint',
		pps   : 'application/vnd.ms-powerpoint',
		pdf   : 'application/pdf',
		xml   : 'application/xml',
		odt   : 'application/vnd.oasis.opendocument.text',
		swf   : 'application/x-shockwave-flash',
		torrent : 'application/x-bittorrent',
		jar   : 'application/x-jar',
		gz    : 'application/x-gzip',
		tgz   : 'application/x-gzip',
		bz    : 'application/x-bzip2',
		bz2   : 'application/x-bzip2',
		tbz   : 'application/x-bzip2',
		zip   : 'application/zip',
		rar   : 'application/x-rar',
		tar   : 'application/x-tar',
		//7z    : 'application/x-7z-compressed'
		// texts
		txt   : 'text/plain',
		php   : 'text/x-php',
		html  : 'text/html',
		htm   : 'text/html',
		js    : 'text/javascript',
		css   : 'text/css',
		rtf   : 'text/rtf',
		rtfd  : 'text/rtfd',
		py    : 'text/x-python',
		java  : 'text/x-java-source',
		rb    : 'text/x-ruby',
		sh    : 'text/x-shellscript',
		pl    : 'text/x-perl',
		xml   : 'text/xml',
		sql   : 'text/x-sql',
		c     : 'text/x-csrc',
		h     : 'text/x-chdr',
		cpp   : 'text/x-c++src',
		hh    : 'text/x-c++hdr',
		log   : 'text/plain',
		csv   : 'text/x-comma-separated-values',
		// images
		bmp   : 'image/x-ms-bmp',
		jpg   : 'image/jpeg',
		jpeg  : 'image/jpeg',
		gif   : 'image/gif',
		png   : 'image/png',
		tif   : 'image/tiff',
		tiff  : 'image/tiff',
		tga   : 'image/x-targa',
		psd   : 'image/vnd.adobe.photoshop',
		ai    : 'image/vnd.adobe.photoshop',
		xbm   : 'image/xbm',
		pxm   : 'image/pxm',
		//audio
		mp3   : 'audio/mpeg',
		mid   : 'audio/midi',
		ogg   : 'audio/ogg',
		oga   : 'audio/ogg',
		m4a   : 'audio/x-m4a',
		wav   : 'audio/wav',
		wma   : 'audio/x-ms-wma',
		// video
		avi   : 'video/x-msvideo',
		dv    : 'video/x-dv',
		mp4   : 'video/mp4',
		mpeg  : 'video/mpeg',
		mpg   : 'video/mpeg',
		mov   : 'video/quicktime',
		wm    : 'video/x-ms-wmv',
		flv   : 'video/x-flv',
		mkv   : 'video/x-matroska',
		webm  : 'video/webm',
		ogv   : 'video/ogg',
		ogm   : 'video/ogg'
}

//array sort function
function sort_osinfo(a, b) {

    try {

        if(a[0] < b[0])
            return -1;
        else if(a[0] > b[0])
            return 1;
        else
            return 0;
    }
    catch(err) {
        //nothing to do
    }

    return a - b;
}


function osinfo_convert(slt)
{
    var lines,
        info = {},
        osinfo = {},
        output = "";

    Util.Debug('>>OSinfo data ' + slt);
    lines = slt.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].split('|');
        if (line.length == 2) {
            info[line[0]] = line[1];
        }
    }

    osinfo['rows'] = new Array();

    var winkeys = [['EditionID', 'Edition'], ['CSDVersion', 'Version'],
        ['CurrentType', 'Type'], ['InstallationType', 'Installation'],
        ['SystemRoot', 'System Root'],

        ['RegisteredOrganization', 'Registered Organization'],
        ['RegisteredOwner', 'Registered Owner']];
    if (info['ProductName']) {
        /* Windows */
        osinfo['title'] = info['ProductName'];
        if(info['ProductName'].search(/windows/i) != -1) {
            for (var i = 0; i < winkeys.length; i++) {
                if (info[winkeys[i][0]]) {
                    osinfo['rows'].push([winkeys[i][1], info[winkeys[i][0]]]);
                }
            }
        } else {
            /* Linux */
            for (var key in info) {
                //skip kernel info
                if(key.search(/kernel/i) != -1)
                    continue;
                osinfo['rows'].push([key, info[key]]);
            }
        }
        
    } else {
        osinfo['title'] = "Unknown OS";
    }
    /*
    $.each(info, function(k, v) {
        if(v.length > 0)
            osinfo['rows'].push([k, v]);
    });
    osinfo['rows'] = osinfo['rows'].sort(sort_osinfo);
    */
    return JSON.stringify(osinfo);
}
