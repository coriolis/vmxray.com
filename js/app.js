function updateFinder() {
    if (!JL.ready) {
        return;
    }
    if (JL.files && JL.files.length) {
        $("#elfinder").remove();
        $("#msg").remove();
        $('<div id="elfinder"></div>').appendTo('#elfinder-container');
        $('#elfinder').elfinder({
            // lang: 'ru',             // language (OPTIONAL)
            url : 'php/connector.php',  // connector URL (REQUIRED)
            transport: {
                init : function(elfinderInstance) {
                    Util.Debug('>> transport init');
                },
                send: function(options) {
                    return pc.jshell.efbridge.cmd(options);
                },
                upload: function(options) {
                    return false;
                }
            },
            uiOptions: {
                toolbar: [
                    ['back', 'forward'],
                    ['info', 'open', 'quicklook'],
                    ['view', 'help'],
                    ['osinfo']
                ],
                tree: {
                    openRootOnLoad: true,
                    syncTree: false
                },
                navbar: {
                    minWidth: 150,
                    maxWidth: 500
                }
            },
            contextmenu: {
                cwd: ['open', 'info'],
                files: ['open', 'info', 'quicklook'],
                group: ['open']
            },
            syncOnFail:false,
            sync: 0,
            debug: true,
            rememberLastDir: false,
            allowShortcuts: false,
            dragUpload: false
        }).elfinder('instance');
    }
}

function testRequiredFeatures() {
    /* Ought to use Modernizr */
    return window.FileReader;
}

/* From http://www.quirksmode.org/js/detect.html */
var BrowserDetect = {
    init: function () {
        this.browser = this.searchString(this.dataBrowser) || "An unknown browser";
        this.version = this.searchVersion(navigator.userAgent)
            || this.searchVersion(navigator.appVersion)
            || "an unknown version";
        this.OS = this.searchString(this.dataOS) || "an unknown OS";
    },
    searchString: function (data) {
        for (var i=0;i<data.length;i++) {
            var dataString = data[i].string;
            var dataProp = data[i].prop;
            this.versionSearchString = data[i].versionSearch || data[i].identity;
            if (dataString) {
                if (dataString.indexOf(data[i].subString) != -1)
                    return data[i].identity;
            }
            else if (dataProp)
                return data[i].identity;
        }
    },
    searchVersion: function (dataString) {
        var index = dataString.indexOf(this.versionSearchString);
        if (index == -1) return;
        return parseFloat(dataString.substring(index+this.versionSearchString.length+1));
    },
    dataBrowser: [
        {
            string: navigator.userAgent,
            subString: "Chrome",
            identity: "Chrome"
        },
        {   string: navigator.userAgent,
            subString: "OmniWeb",
            versionSearch: "OmniWeb/",
            identity: "OmniWeb"
        },
        {
            string: navigator.vendor,
            subString: "Apple",
            identity: "Safari",
            versionSearch: "Version"
        },
        {
            prop: window.opera,
            identity: "Opera",
            versionSearch: "Version"
        },
        {
            string: navigator.vendor,
            subString: "iCab",
            identity: "iCab"
        },
        {
            string: navigator.vendor,
            subString: "KDE",
            identity: "Konqueror"
        },
        {
            string: navigator.userAgent,
            subString: "Firefox",
            identity: "Firefox"
        },
        {
            string: navigator.vendor,
            subString: "Camino",
            identity: "Camino"
        },
        {       // for newer Netscapes (6+)
            string: navigator.userAgent,
            subString: "Netscape",
            identity: "Netscape"
        },
        {
            string: navigator.userAgent,
            subString: "MSIE",
            identity: "Explorer",
            versionSearch: "MSIE"
        },
        {
            string: navigator.userAgent,
            subString: "Gecko",
            identity: "Mozilla",
            versionSearch: "rv"
        },
        {       // for older Netscapes (4-)
            string: navigator.userAgent,
            subString: "Mozilla",
            identity: "Netscape",
            versionSearch: "Mozilla"
        }
    ],
    dataOS : [
        {
            string: navigator.platform,
            subString: "Win",
            identity: "Windows"
        },
        {
            string: navigator.platform,
            subString: "Mac",
            identity: "Mac"
        },
        {
               string: navigator.userAgent,
               subString: "iPhone",
               identity: "iPhone/iPod"
        },
        {
            string: navigator.platform,
            subString: "Linux",
            identity: "Linux"
        }
    ]

};

function testBrowserVersion() {
    /* Feature checking alone isn't enough. Some browsers have features but they don't work */
    var supported = [
        {
            browser: 'Chrome',
            version: 15.0
        },
        {
            browser: 'Firefox',
            version: 6.0
        },
        {
            browser: 'Opera',
            version: 11.0
        }
    ];
    BrowserDetect.init();
    for (var i = 0; i < supported.length; i++) {
        if (BrowserDetect.browser == supported[i].browser &&
            BrowserDetect.version >= supported[i].version) {
            return true;
        }
    }
    return false;
}

function setupListeners() {
    if(!testRequiredFeatures()) {
        $('#msg p.status').replaceWith('<p class="status error">Sorry! VMXRay uses bleeding edge HTML5 features, and will not work on your browser. Browsers known to work include Google Chrome 14, Firefox 6 and Opera 11.</p>');
        return;
    }
    if (!testBrowserVersion()) {
        $('#msg p.status').replaceWith('<p class="status warning">VMXRay uses bleeding edge HTML5 features. Browsers known to work include Google Chrome 14, Firefox 6 and Opera 11. Your browser appears to be older, so your mileage may vary.</p>');
    }
    term_start();
    start();
    JL.readylistener = function() {
        $('#msg p.status').replaceWith('<p class="status">Appliance ready. Let\'s go explore!</p>');
        updateFinder();
    }
    $('table').detach().prependTo('#linux-container');
    $('#slider').slider({
        from: 0,
        to: 11,
        round: 0,
        dimension: ' ',
        onstatechange: handleRange,
        skin: 'round'
    });
    $('#slider-container').css('visibility', 'visible').fadeIn();
    $('#geekbar > p').replaceWith('<p>Under the hood &rarr;</p>');

    function handleRange(val) {
        $('#linux-container').css('opacity', val / 11.0);
        $('#elfinder-container').css('opacity', (11.0 - val) / 11.0);
    }
        
    function setFiles(files) {
        var base_vmdk = -1;
        for (var i = 0, f; f = files[i]; i++) {
            JL.files[i] = f;
            if (f.name.match(/\.vmdk/i) && !f.name.match(/\-s\d{3}\.vmdk/i)) {
                base_vmdk = i;
            }
        }
        if (JL.files.length > 1 && base_vmdk != -1) {
            /* only supported case now is multi-file vmdk */
            var tmp = JL.files[0];
            JL.files[0] = JL.files[base_vmdk];
            JL.files[base_vmdk] = tmp;
        }
    }

    function handleFormFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        setFiles(evt.target.files);
        $('<p>Exploring ' + JL.files[0].name + '..</p>').appendTo($('#msg'));
        updateFinder();
    }

    function handleFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        setFiles(evt.dataTransfer.files);
        $('<p>Exploring ' + JL.files[0].name + '..</p>').appendTo($('#msg'));
        updateFinder();
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
    }

    $('#files_input').change(handleFormFileSelect);
    document.getElementById('linux-container').addEventListener('drop', handleFileSelect, false);
    document.getElementById('linux-container').addEventListener('dragover', handleDragOver, false);
    document.getElementById('elfinder-container').addEventListener('drop', handleFileSelect, false);
    document.getElementById('elfinder-container').addEventListener('dragover', handleDragOver, false);
    document.getElementById('msg').addEventListener('drop', handleFileSelect, false);
    document.getElementById('msg').addEventListener('dragover', handleDragOver, false);
}

/*
 * Derived from Fabrice Bellard's jslinux.js
 */

var term, pc;

function term_start()
{
    term = new Term(100, 30, term_handler);
    term.open();
}

/* send chars to the serial port */
function term_handler(str)
{
    pc.serial.send_chars(str);
}

function start()
{
    var start_addr, params, init_data;
    
    params = new Object();

    /* serial output chars */
    params.serial_write = term.write.bind(term);

    /* memory size (in bytes) */
    params.mem_size = 16 * 1024 * 1024;

    var jshell = new JShell();
    params.clipboard_set = jshell.output.bind(jshell);
    params.clipboard_get = function() { return "NOTHING" }

    init_data = {};
    init_data.start_addr = 0x10000;
    init_data.initrd_size = 0;

    pc = new PCEmulator(params);
    
    // JShell
    jshell.jlhost = new JLHost(pc, 0x180, pc.pic.set_irq.bind(pc.pic, 5));
    jshell.pc = pc;
    pc.jshell = jshell;

    pc.load_binary("vmlinux26.tif", 0x00100000, load_rootfs);

    function load_rootfs(ret)
    {
        if (ret < 0) {
            Util.Debug('Failed to load Linux kernel');
            return;
        }
        pc.load_binary("rootfs.tif", 0x00400000, load_linuxstart);
    }

    function load_linuxstart(ret)
    {
        if (ret < 0) {
            Util.Debug('Failed to load root fs');
            return;
        }
        init_data.initrd_size = ret;
        pc.load_binary("linuxstart.tif", init_data.start_addr, complete_boot);
    }

    function complete_boot(ret) {
        if (ret < 0) {
            Util.Debug('Failed to load linuxstart');
            return;
        }
        var cmdline_addr = 0xf800;
        pc.cpu.write_string(cmdline_addr, "console=ttyS0 root=/dev/ram0 rw init=/sbin/init notsc=1 jsclipboard.jlfs=1");
    
        Util.Debug('initrd_size ' + init_data.initrd_size + ' mem_size ' + params.mem_size);
        pc.cpu.eip = init_data.start_addr;
        pc.cpu.regs[0] = params.mem_size; /* eax */
        pc.cpu.regs[3] = init_data.initrd_size; /* ebx */
        pc.cpu.regs[1] = cmdline_addr; /* ecx */
    
        pc.start();
    }
}
