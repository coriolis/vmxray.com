
function my_pread(fd, buf, nbytes, off) {
    Module['print']("my_pread " + nbytes + " off " + off);
        
    var stream = FS.streams[fd];
    if(stream.path == "/" + fileInstance.name) {
        //read the image file
        if(off < 0) {
            off = off >>> 0;
            Module['print']("offset negative trying " + off + " size:" + fileInstance.size );
        }
        var result = 0;
        var size = Math.min(fileInstance.size - off, nbytes);

        //read through sync api
        var fsreader = new FileReaderSync();
        var blob = fileInstance.slice(off, off+size+1);
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


var myreader = new Object();
myreader.get = function (idx) {
}




var fileInstance = null;
var fcontent = new Object();

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
    
    fcontent.length = fs.size;
    Module['FS_createDataFile']('/', fs.name, fcontent, true, false);
    fileInstance = fs;
    
}

