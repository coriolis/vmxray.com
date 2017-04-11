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


function WShell() {
    this.efbridge = new EFBridge();
    this.files = [];
    this.cmd_inprogress = null;
    this.queue = [];
    this.obuffer = '';
}

WShell.prototype.cmd = function(str) {
    Util.Debug('>> cmd ' + str);
    var dfrd = $.Deferred();
    dfrd.abort = function(jsh) {
        if (this === jsh.cmd_inprogress) {
            // XXX May need to abort worker and spawn a new one
            console.log("Try to send Ctrl-C");
        }
        this.reject('abort');
    }.bind(dfrd, this);
    dfrd.fire = function(jsh, s) {
        console.log("Send command : " + s);
        log_to_term("Send command : slt " + s.join(' '));
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

WShell.prototype.output = function(str, is_done) {

    if (typeof(is_done) === 'undefined')
        is_done = false;

    if (this.cmd_inprogress && !this.cmd_inprogress.isRejected()) {
        var end = 0;
        // Pass results, unless we had aborted the command
        //this.cmd_inprogress.resolve(str);
        this.obuffer += str;
        if(is_done) {
            this.cmd_inprogress.resolve(this.obuffer);
            this.obuffer = '';
            while ((this.cmd_inprogress = this.queue.pop())) {
                if (!this.cmd_inprogress.isRejected() && !this.cmd_inprogress.isResolved()) {
                    this.cmd_inprogress.fire();
                    break;
                }

            }
        }

    }
}

function EFBridge() {
    this.cache = {}; // cache of file stat data
    this.ShowDeleted = false;
}

EFBridge.CACHE_FILEDATA_MAX = 1024 * 100;
EFBridge.sleuthkit_opts = {vmdk: ['-i', 'QEMU'], vdi: ['-i', 'QEMU'], qcow2: ['-i', 'QEMU'], vhd: ['-i', 'QEMU'], img: ['-i', 'QEMU']}
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
    var res, cwd;
    try {
        res = $.parseJSON('{' + result + '}');
    } catch(err) {
        return dfrd.reject(dfrd, 'Failed to parse JSON output from slt');
    }

    var files = new Array();
    var subdir_exists = false;
    var first_part = null;

    if (target == 'ROOT') {
        cwd = {name: jshell.files[0].name, hash: "ROOT", phash: "", date: "30 Jan 2010 14:25", mime: "directory", size: 0, read: 1, write: 1, locked: 0, volumeid: jshell.files[0].name};
        this.cache[cwd.hash] = $.extend(true, {}, cwd);
        this.cache['Partitions'] = Array();
        this.cache['SelectedPartition'] = -1;
        subdir_exists = true;
    } else {
        cwd = $.extend(true, {}, this.cache[target]);
    }

    if (res && res.partitions && this.cache['Partitions'].length == 0) {
        var parts = res.partitions, partdesc, idx = 0;
        for (var p = 0; p < parts.length - 1; p++) {
            this.cache['Partitions'].push({'offset': parts[p].start,
                'length': parts[p].len});
                if(parts[p].desc && (idx = parts[p].desc.indexOf("(")) > 0)
                    partdesc = parts[p].desc.slice(0, idx - 1);
                else
                    partdesc = parts[p].desc;
                var file = {
                    name: 'Part ' + this.cache['Partitions'].length + ' ' + parseSize(parts[p].len) + ' ' + partdesc,
                    hash: 'p' + parts[p].start,
                    mime: 'directory', phash: cwd.hash,
                    size: parts[p].len, read: 1, write: 1, locked: 0};

                files.push(file);
                this.cache[file.hash] = file;
                if (!first_part)
                    first_part = file;
        }
    }

    if (res && res.files) {
        var flist = res.files;

        for (var i = 0; i < flist.length - 1; i++) {
            var f = flist[i];
            if (f.name == ".") {
                if (target == 'ROOT' && this.cache['Partitions'].length <= 1) {
                    cwd.hash = 'h' + f.inum;
                    this.cache[cwd.hash] = $.extend(true, {}, cwd);
                }
                continue;
            }
            if (f.name == "..") {
                continue;
            }
            var filter = EFBridge.filter_entries.reduce(function(prev, curr) {
                return prev || f.name.match(curr);
            }, false);
            if (filter) {
                continue;
            }
            if (f.deleted) {
                if (this.ShowDeleted) {
                    f.name = '#' + f.name;
                }
                else {
                    continue;
                }
            }
            var ext = f.name.slice(f.name.lastIndexOf('.') + 1);
            var mime = this.mime_map[ext.toLowerCase()] || 'text/plain';
            var file = {name: f.name, hash: 'h' + f.inum,
                phash: (first_part && this.cache['Partitions'].length > 1)  ? first_part.hash : cwd.hash,
                date: f.mtime, mime: (f.dtype == 'd') ? 'directory' : mime,
                size: f.size, read: 1, write: 1, locked: 0};
            files.push(file);
            this.cache[file.hash] = file;
            if (f.dtype == 'd') {
                subdir_exists = true;
            }
        }
    }
    if (subdir_exists) {
        cwd.dirs = 1;
    }

    if(this.cache['Partitions'].length == 1) {
        var idx = files.indexOf(first_part);
        if(idx >= 0)
            files.splice(idx, 1);
        console.log("Removed part at " + idx);
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

    var image = jshell.files[0].name;
    var ext = image.slice(image.lastIndexOf('.') + 1);
    var opt = EFBridge.sleuthkit_opts[ext.toLowerCase()] || ['-a'];
    var cmd = opt.slice();

    if(target.slice(0, 1) == 'p') {
        cmd.push('-P');
        cmd.push(target.slice(1));
    }else if (target != 'ROOT') {
        cmd.push('-I');
        cmd.push(target.slice(1));
    }
    cmd.push.apply(cmd, ['-l', image]);
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

    var image = jshell.files[0].name;
    var ext = image.slice(image.lastIndexOf('.') + 1);
    var opt = EFBridge.sleuthkit_opts[ext.toLowerCase()] || [];

    if (target == 'osinfo' && !this.cache[target]) {
        var h = {name: "osinfo", hash: "osinfo", phash: "", date: "30 Jan 2010 14:25", mime: "text/html", size: 1024, read: 1, write: 1, locked: 0,
                        volumeid: image};
        this.cache[target] = $.extend(true, {}, h);
    }

    var ct = this.cache[target];
    /*
    if (!ct || ct.mime == 'directory') {
        dfrd.status = 403;
        dfrd.reject(dfrd, 'get: invalid target');
        return dfrd;
    }
    if (!ct.size) {
        dfrd.resolve({content: ''});
        return dfrd;
    }
    */

    if (ct.data) {
     //   Util.Debug('>> efbridge get cache hit: ' + JSON.stringify(ct.data));
        dfrd.resolve({content: ct.data});
        return dfrd;
    }

    //if its directory use -e
    if (!ct || ct.mime == 'directory')
       var gopt = ['-e', this.cache[target].name + ".zip", '-I', target.slice(1)];
    else
       var gopt = (target == 'osinfo') ? ['-t'] : ['-c', '-I', target.slice(1)];

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

function parseSize(size) {
	var suffix = ["bytes", "KB", "MB", "GB", "TB", "PB"],
		tier = 0;

	while(size >= 1024) {
		size = size / 1024;
		tier++;
	}

	return Math.round(size * 10) / 10 + " " + suffix[tier];
}
