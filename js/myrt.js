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

function setup_file(fs) {
    //do this once
    if(fileInstance == null)
    {
        if (Module && this._pread) {
            this._orig_pread = this._pread;
            this._pread = my_pread;
            Module._pread = my_pread;
        }
    }
    
    for(var i=0; i< fs.length; i++) {
        var fcontent = new Object();
        fcontent.length = fs[i].size;
        Module['FS_createDataFile']('/', fs[i].name, fcontent, true, false);
    }
    fileInstance = fs[0];
    fileInstanceList = fs;
    
}

