
"use strict";

function log(x) {
    console.log(Date.now() + ' ' + x);
}

// Try reading from src and pushing into the functioned dst as fast as
// it can accept without buffering.

function functioning_pipe(src, dst, fn) {

    function continue_reading() {
	can_read = true;

	if (pending_read) {
	    pending_read = false;
	    src_on_readable();
	}
    }

    function src_on_readable() {

	if (!can_read) {
	    pending_read = true;
	    return;
	}

	var data = src.read();
	log('funcpipe\t' + src.localPort + '  -> ' + dst.remotePort + ' ' + (data === null ? null : data.length));

	if (data === null) {
	    log('funcpipe\t' + 'unexpected null data from client');
	    return;
	}

	dc(data);
	// can't read again until we get the all-clear
	can_read = false;
    }

    var pending_read = false;
    var can_read = true;
    var dc = fn(dst, continue_reading);

    src.on('readable', src_on_readable);
}

// TODO: shut down cleanly

function interval_functioning_pipe(src, dst, fn, interval) {

    function pipe_available() {
	pipe_busy = false;
	setTimeout(send_something, interval);

	if (pending_write) {
	    pending_write = false;
	    send_something();
	}
    }

    function src_on_readable() {
	read_available = true;
    }

    function send_something() {
	if (pipe_busy) {
	    pending_write = true;
	    return;
	}

	var need_len = 1024;

	var data = new Buffer(need_len);
	var pos = 0;

	var inlen;
	var wrlen;
	var num_zeroes;
	var cover_header;

	if (finish_cover) {
	    data[pos] = cover_split[1];
	    pos += 1;
	    finish_cover = false;
	}

	if ((input_buffer === null) && read_available) {
	    input_buffer = src.read();
	    read_available = false;
	}
	if (input_buffer !== null) {
	    inlen = need_len - 2;

	    if ((input_buffer.length < inlen) && read_available) {
		input_buffer = Buffer.concat([input_buffer, src.read()]);
		read_available = false;
	    }

	    wrlen = Math.min(input_buffer.length, inlen);

	    data.writeUInt16LE(wrlen, pos);
	    pos += 2;
	    input_buffer.copy(data, pos, 0, wrlen);
	    pos += wrlen;
	    input_buffer = (wrlen === input_buffer.length) ? null : input_buffer.slice(wrlen);

	    if (wrlen === inlen) {
		// no cover needed
		dc(data);
		pipe_busy = true;
		return;
	    }
	}

	if ((pos + 1) === need_len) {
	    data[pos] = cover_split[0];
	    pos += 1;
	    finish_cover = true;
	} else {
	    num_zeroes = (need_len - pos) - 2;
	    data.writeUInt16LE(0x8000 | num_zeroes, pos);
	    pos += 2;
	    data.fill(0, pos);
	    pos += num_zeroes;
	}

	// fling it at the wire
	log('ssomething\t' + src.localPort + ' -> ' + dst.remotePort + ' ' + data.length);
	dc(data);
	pipe_busy = true;
    }

    // cover header for 0 body-length
    var cover_split = new Buffer(2);
    cover_split.writeUInt16LE(0x8000, 0); //[0x00, 0x80]
    var finish_cover = false;

    var pipe_busy = false;

    var read_available = false;
    var pending_write = false;

    var input_buffer = null;

    var dc = fn(dst, pipe_available);

    src.on('readable', src_on_readable);

    setTimeout(send_something, 0);
}

// Pass some cover data in, it will be parsed and each non-cover chunk
// written to writeable immediately (any further timing quantisation
// needs to be done explicitly by receiver).
//
// Once all data is written and drained, on_write_complete will be
// called, indicating that we are ready for more data. This can occur
// whilst some data is still held, ie. if header is still being
// decoded.
//
// It is an error to write again before the on complete is called.

function decoverer(dst, on_write_complete) {

    function continue_writing() {
	var data = c_rem_buf;
	c_rem_buf = null;
	awaiting_drain = false;
	write_func(data);
    }

    function write_func(data) {

	var header;
	var drained;

	if (awaiting_drain) {
	    throw new Error('Please await drain before writing more');
	}

	if (data === null) {
	    setTimeout(on_write_complete, 0);
	    return;
	}

	while (true) {

	    if (c_bytes_rem === 0) {
		// we potentially have a byte of leftover header from
		// last buffer
		if (c_rem_buf !== null) {
		    data = Buffer.concat([c_rem_buf, data]);
		    c_rem_buf = null;
		}
		if (data.length < 2) {
		    c_rem_buf = data;
		    setTimeout(on_write_complete, 0);
		    return;
		}
		header = data.readUInt16LE(0);
		c_in_cover = (header & 0x8000) !== 0;
		c_bytes_rem = header & 0x7fff;
		data = data.slice(2);
	    }

	    drained = true;

	    if (c_bytes_rem >= data.length) {

		if (!c_in_cover) {
		    log('decover \t' + 'full ->  ' + dst.remotePort + ' ' + data.length);
		    drained = dst.write(data);
		}
		c_bytes_rem -= data.length;

		if (drained) {
		    setTimeout(on_write_complete, 0);
		} else {
		    dst.once('drain', on_write_complete);
		}
		return;
	    }

	    if (!c_in_cover) {
		log('decover \t' + 'part ->  ' + dst.remotePort + ' ' + data.slice(0, c_bytes_rem).length);
		drained = dst.write(data.slice(0, c_bytes_rem));
	    }
	    data = data.slice(c_bytes_rem);
	    c_bytes_rem = 0;

	    if (!drained) {
		awaiting_drain = true;
		c_rem_buf = data;
		dst.once('drain', continue_writing);
		return;
	    }
	}
    }

    var awaiting_drain = false;
    var c_rem_buf = null;
    var c_in_cover = true;
    var c_bytes_rem = 0;

    return write_func;
}

function encoverer(dst, on_write_complete) {

    function continue_writing_data() {
	awaiting_drain = false;
	setTimeout(on_write_complete, 0);
    }

    function write_func(data) {
	var drained;

	if (awaiting_drain) {
	    throw new Error('Please await drain before writing more');
	}

	if (data === null) {
	    log('encover \t' + 'unexpected null data from server');
	    setTimeout(on_write_complete, 0);
	    return;
	}

	log('encover \t' + 'src  ->  ' + dst.remotePort + ' ' + data.length);
	drained = dst.write(data);

	if (!drained) {
	    awaiting_drain = true;
	    dst.once('drain', continue_writing_data);
	    return;
	}

	setTimeout(on_write_complete, 0);
    }

    var awaiting_drain = false;
    var c_rem_data = null;

    return write_func;
}

function decovering_pipe(src, dst) {
    functioning_pipe(src, dst, decoverer);
}

// FIXME: need something like functioning pipe, but which runs after
// an interval of say 25ms since last on_complete. At this point it
// should write a fixed amount of data, say 1KB. If there is 1KB or
// more of real data to send, the first 1KB will be used (minus the
// header), else any extra is made up with cover (header sent
// potentially over 2 sends).

function encovering_pipe(src, dst) {
    interval_functioning_pipe(src, dst, encoverer, 25);
}

module.exports = {}
module.exports.decovering_pipe = decovering_pipe;
module.exports.encovering_pipe = encovering_pipe;
