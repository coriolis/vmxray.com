function updateFinder() {
    if (!JL.ready) {
        return;
    }
    if (JL.files && JL.files.length) {

        $("#elfinder").remove();
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
                }
            },
            uiOptions: {
                toolbar: [
                    ['back', 'forward'],
                    ['info', 'open', 'quicklook'],
                    ['view', 'help']
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
            sync: 1000000,
            debug: true,
            rememberLastDir: false
        }).elfinder('instance');
    }
}

function setupListeners() {
    term_start();
    start();
    JL.readylistener = function() {
        $('#msg p.status').replaceWith('<p class="status">Appliance ready. Let\'s go exploring!</p>');
        updateFinder();
    }
    //$('#slider-container').hide();
    //$('#files_list').hide();
    $('table').detach().appendTo('#linux-container');
    $('#slider').slider({
        from: 0,
        to: 11,
        round: 0,
        dimension: ' ',
        onstatechange: handleRange,
        skin: 'round'
    });
    $('a.button').click(function() {
        $('a.button').fadeOut('slow', function() {
            $('a.button').remove();
            $('#slider-container').css('visibility', 'visible').fadeIn();
        })
    });

    function handleRange(val) {
        $('#linux-container').css('opacity', val / 11.0);
        $('#elfinder-container').css('opacity', (11.0 - val) / 11.0);
    }
        
    function handleFormFileSelect(evt) {
        var files = evt.target.files; // FileList object
    
        // files is a FileList of File objects. List some properties.
        var output = [];
       // $('#files_list').html('<p>Exploring ' + files[0].name + '</p>').fadeIn();
       $('<p>Exploring ' + files[0].name + '..</p>').appendTo($('#msg'));
        JL.files = files;
        updateFinder();
      }
      $('#files_input').change(handleFormFileSelect);

    function handleFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
    
        var files = evt.dataTransfer.files; // FileList object.
    
        // files is a FileList of File objects. List some properties.
        var output = [];
        for (var i = 0, f; f = files[i]; i++) {
          output.push('<li><strong>', f.name, '</strong> (', f.type || 'n/a', ') - ',
                      f.size, ' bytes, last modified: ',
                      f.lastModifiedDate.toLocaleDateString(), '</li>');
        }
        document.getElementById('files_list').innerHTML = '<ul>' + output.join('') + '</ul>';
        JL.files = files;
        updateFinder();
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
    }
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
    var start_addr, initrd_size, params, cmdline_addr;
    
    params = new Object();

    /* serial output chars */
    params.serial_write = term.write.bind(term);

    /* memory size (in bytes) */
    params.mem_size = 16 * 1024 * 1024;

    var jshell = new JShell();
    params.clipboard_set = jshell.output.bind(jshell);
    params.clipboard_get = function() { return "NOTHING" }

    pc = new PCEmulator(params);
    
    // JShell
    jshell.jlhost = new JLHost(pc, 0x180, pc.pic.set_irq.bind(pc.pic, 5));
    jshell.pc = pc;
    pc.jshell = jshell;

    pc.load_binary("vmlinux26.bin", 0x00100000);

    initrd_size = pc.load_binary("rootfs.ext2", 0x00400000);

    start_addr = 0x10000;
    pc.load_binary("linuxstart.bin", start_addr);

    /* set the Linux kernel command line */
    /* Note: we don't use initramfs because it is not possible to
       disable gzip decompression in this case, which would be too
       slow. */
    cmdline_addr = 0xf800;
    pc.cpu.write_string(cmdline_addr, "console=ttyS0 root=/dev/ram0 rw init=/sbin/init notsc=1 jsclipboard.jlfs=1");

    pc.cpu.eip = start_addr;
    pc.cpu.regs[0] = params.mem_size; /* eax */
    pc.cpu.regs[3] = initrd_size; /* ebx */
    pc.cpu.regs[1] = cmdline_addr; /* ecx */

    pc.start();
}
