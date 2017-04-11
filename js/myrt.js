function my_pread(fd, buf, nbytes, offl, offh) {

    var off = (((offl)>>>0)+(((offh)>>>0)*4294967296));
    var stream = FS.streams[fd];
    var flag = false;
    var finst = null
    //Module['print']("my_pread " + nbytes + " off " + off);
    for(var i=0; i<fileInstanceList.length; i++) {
        if(stream.path == "/" + fileInstanceList[i].name) {
            flag = true;
            finst = fileInstanceList[i];
            break;
        }
    }
    if(flag) {
        //read the image file
        if(off < 0) {
            off = off >>> 0;
            Module['print']("offset negative trying " + off + " size:" + fileInstance.size );
        }
        var result = 0;
        var size = Math.min(finst.size - off, nbytes);

        //read through sync api
        var fsreader = new FileReaderSync();
        var blob = finst.slice(off, off+size+1);
        var arr = new Int8Array(fsreader.readAsArrayBuffer(blob));

        for(var i=0; i<size;i++) {
            HEAPU8[((buf)+(i))] = arr[i];
        }

        return size;
    } else
        //call original
        return _orig_pread(fd, buf, nbytes, off);

}

/*
if (Module && Module._pread) {
    Module._pread = my_pread;
}
else if(this._pread) {
    //add hook for the pread
    this._orig_pread = this._pread;
    this._pread = my_pread;
}
*/

var fileInstance = null;
var fileInstanceList = null;
var remote_url = null;

function setup_file(fs) {
    //do this once
    //if(fileInstance == null)
    {
        if (Module && this._pread) {
            this._orig_pread = this._pread;
            if (fs[0]['is_remote']) {
                this._open = remote_open;
                Module._open = remote_open;

                this._pread = remote_pread;
                Module._pread = remote_pread;
            } else {
               this._pread = my_pread;
                Module._pread = my_pread;
            }
        }
    }

    if (fs[0]['is_remote']) {
        remote_url = fs[0]['file'];
        fileInstance = null;
        fileInstanceList = null;
    } else {
        var fslist = []
        for(var i=0; i< fs.length; i++) {
            var fcontent = new Object();
            fcontent.length = fs[i]['file'].size;
            fslist[i] = fs[i]['file'];
            Module['FS_createDataFile']('/', fs[i].name, fcontent, true, false);
        }
        fileInstance = fs[0]['file'];
        fileInstanceList = fslist;
        remote_url = null;
    }
}

function remote_open(path, flags) {
    var new_data = null;
    var failed = false;
    var xhttp = new XMLHttpRequest();
    var len = 10; // read 10 bytes
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 ) {
            if (this.status == 200) {
                if (this.responseText.length != len)
                    failed = true;
                console.log("Received data of length " + this.responseText.length);
                new_data = this.responseText;
            } else {
                failed = true;
            }
        }
    };

    xhttp.open("GET", remote_url + "?off="+0+"&len="+len, false);
    xhttp.send();

    if (failed) {
        console.log("Failed to get URL " + remote_url + " status " + xhttp.status);
        return -1;
    }
    /* return sudo fd */
    if (new_data) {
        return 4;
    }
}

function remote_pread(fd, buf, nbytes, offl, offh) {

    var new_data = null;
    var off = (((offl)>>>0)+(((offh)>>>0)*4294967296));
    if(off < 0)
        off = off >>> 0;
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            console.log("Received in read data of length " + this.response.byteLength);
            new_data = new Uint8Array(this.response);
        }
    };
    xhttp.open("GET", remote_url+ "?off="+off+"&len="+nbytes, false);
    xhttp.responseType = "arraybuffer";
    xhttp.send();

    var size = new_data.length;
    for(var i=0; i<size;i++) {
        HEAPU8[((buf)+(i))] = new_data[i];
    }
    return size;
}