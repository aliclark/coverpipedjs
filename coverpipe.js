
"use strict";

var net = require('net');
var cl = require('./coverlib');

var user_map = {}

function cc_connected(cc_c) {

    function cc_c_on_error(e) {
	console.log('nc   <-> 7000 error');
	console.log(e);
	cs.end();
    }

    function cs_on_error(e) {
	console.log('7000 <-> 9000 error');
	console.log(e);
	cc_c.end();
    }

    function cc_c_on_close() {
	user_map[9000] -= 1;
	console.log('nc   <-> 7000 closed');
    }

    function cs_on_close() {
	console.log('7000 <-> 9000 closed');
    }

    function cc_c_on_end() {
	console.log('nc    -> 7000 FIN');
	console.log('7000 ->  9000 FIN');
	cs.end();
    }

    function cs_on_end() {
	console.log('9000  -> 7000 FIN');
	console.log('7000 ->    nc FIN');
	cc_c.end();
    }

    function cs_connected() {
	console.log('7000 <-> 9000 connected');
	cl.encovering_pipe(cc_c, cs);
	cl.decovering_pipe(cs, cc_c);
    }

    if (!(9000 in user_map)) {
	user_map[9000] = 0;
    }

    if (user_map[9000] >= 1) {
	console.log('rejecting connection, already have one');
	// connecting to the same location twice is almost certainly a
	// mistake, may indicate once cover connection per short-lived
	// request, which would still be very bad. Use pipemux
	// instead.
	cc_c.end();
	return;
    }

    user_map[9000] += 1;

    console.log('nc   <-> 7000 connected');
    cc_c.on('error', cc_c_on_error);
    cc_c.on('close', cc_c_on_close);
    cc_c.on('end', cc_c_on_end);

    var cs = net.connect({ allowHalfOpen: true, port: 9000 }, cs_connected);
    cs.on('error', cs_on_error);
    cs.on('close', cs_on_close);
    cs.on('end', cs_on_end);
}

function cc_listening() {
    console.log('7000 listening');
}

function main() {
    var cc = net.createServer({ allowHalfOpen: true }, cc_connected);
    cc.listen(7000, cc_listening);
}

main();
