var vmxworker = null;
function initWorker() {
    if(vmxworker)
    {
        vmxworker.terminate();
        $("#id_table_output").empty();
    }

    vmxworker = new Worker('js/slt.js');
    vmxworker.onmessage = function (evt) {
        if(evt.data['type'] == 1) {
            //console.log("Worker Message: " + evt.data['type'] + ":" + evt.data['is_last_message'] + " : " + evt.data['text']);
            jshell.output(evt.data['text'], evt.data['is_last_message']);
        }
        else
        {
            //log_to_term(evt.data['text']);
            if(evt.data['text'].indexOf("qemu_read") < 0)
            console.log("Worker Message: " + evt.data['type'] + " : " + evt.data['text']);
        }
   };
   vmxworker.postMessage({'type': 'init', 'data': jshell.files});
}

function log_to_term(str) {

    $("#id_table_output").append("<tr><td class=\"term\">" + str + "</td></tr>");

    //remove any extra lines limit to 25
    var len = $("#id_table_output").find('tr').length - 25;
    if(len > 0)
        $("#id_table_output").find('tr:lt('+len+')').remove()

}

function updateFinder() {
    if (jshell.files && jshell.files.length) {
        $("#elfinder").remove();
        $("#msg").remove();
        $('<div id="elfinder"></div>').appendTo('#elfinder-container');
        $('#elfinder').elfinder({
            // lang: 'ru',             // language (OPTIONAL)
            url : 'php/connector.php',  // connector URL (REQUIRED)
            transport: {
                init : function(elfinderInstance) {
                    Util.Debug('>> transport init');
                    //return jshell.efbridge.cmd(options);
                    initWorker();
                },
                send: function(options) {
                    return window.jshell.efbridge.cmd(options);
                    //return window.mw.postMessage({'type': 'send', 'data': options});
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
                files: ['open', 'info', 'quicklook', 'download'],
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
    window.jshell = new WShell();
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

    function setFiles(files, is_remote=false) {
        var base_vmdk = -1;
        if (is_remote) {
            jshell.files[0] = { 'is_remote': true, 'file': files, 'name': files };
        } else {
            for (var i = 0, f; f = files[i]; i++) {
                jshell.files[i] = {'is_remote':false, 'file':f, 'name':f.name};
                if (f.name.match(/\.vmdk/i) && !f.name.match(/\-s\d{3}\.vmdk/i)) {
                    base_vmdk = i;
                }
            }
            if (jshell.files.length > 1 && base_vmdk != -1) {
                /* only supported case now is multi-file vmdk */
                var tmp = jshell.files[0];
                jshell.files[0] = {'is_remote': false, 'file': jshell.files[base_vmdk], 'name':jshell.files[base_vmdk].name};
                jshell.files[base_vmdk] = {'is_remote': false, 'file': tmp, 'name':tmp.name };
            }
        }
    }

    function handleRemoteFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        var values = {};
        var is_ok = true;
        $.each($(this).serializeArray(), function(i, field) {
            values[field.name] = field.value;
        });

        $.ajax({ url:values['remote_file'], async:false}).fail( function() {
                alert("Failed to access given url:" + values['remote_file']);
                is_ok = false;
            });

        if (is_ok) {
            setFiles(values['remote_file'], is_remote=true);
            $('<p>Exploring ' + jshell.files[0].name + '..</p>').appendTo($('#msg'));
            updateFinder();
        }
    }

    function handleFormFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        setFiles(evt.target.files);
        $('<p>Exploring ' + jshell.files[0].name + '..</p>').appendTo($('#msg'));
        updateFinder();
    }

    function handleFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        setFiles(evt.dataTransfer.files);
        $('<p>Exploring ' + jshell.files[0].name + '..</p>').appendTo($('#msg'));
        updateFinder();
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
    }

    $('#files_input').change(handleFormFileSelect);
    $('#remote_file_form').submit(handleRemoteFileSelect);
    document.getElementById('linux-container').addEventListener('drop', handleFileSelect, false);
    document.getElementById('linux-container').addEventListener('dragover', handleDragOver, false);
    document.getElementById('elfinder-container').addEventListener('drop', handleFileSelect, false);
    document.getElementById('elfinder-container').addEventListener('dragover', handleDragOver, false);
    document.getElementById('msg').addEventListener('drop', handleFileSelect, false);
    document.getElementById('msg').addEventListener('dragover', handleDragOver, false);
}
