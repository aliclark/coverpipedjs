
"use strict";

var net = require('net');
var cl = require('./coverlib');

function cs_connected(cs) {

    function cs_on_error(e) {
	console.log('7000 <-> 9000 error');
	console.log(e);
	ss.end();
    }

    function ss_on_error(e) {
	console.log('9000 <-> 8001 error');
	console.log(e);
	cs.end();
    }

    function cs_on_close() {
	console.log('7000 <-> 9000 closed');
    }

    function ss_on_close() {
	console.log('9000 <-> 8001 closed');
    }

    function cs_on_end() {
	console.log('7000  -> 9000 FIN');
	console.log('9000 ->  8001 FIN');
	ss.end();
    }

    function ss_on_end() {
	console.log('8001  -> 9000 FIN');
	console.log('9000 ->  7000 FIN');
	cs.end();
    }

    function ss_connected() {
	console.log('9000 ->  8001 connected');
	cl.decovering_pipe(cs, ss);
	cl.encovering_pipe(ss, cs);
    }

    console.log('7000  -> 9000 connected');
    cs.on('error', cs_on_error);
    cs.on('close', cs_on_close);
    cs.on('end', cs_on_end);

    var ss = net.connect({ allowHalfOpen: true, port: parseInt(process.argv[3], 10) }, ss_connected);
    ss.on('error', ss_on_error);
    ss.on('close', ss_on_close);
    ss.on('end', ss_on_end);
}

function server_listening() {
    console.log('9000 listening');
}

function main() {
    var server = net.createServer({ allowHalfOpen: true }, cs_connected);
    server.listen(parseInt(process.argv[2], 10), server_listening);
}

main();
