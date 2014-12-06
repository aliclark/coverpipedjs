coverpiped
==========

{ssh,mutt} | muxpipe | coverpipe | spiped -e | ~~~~ | spiped -d | coverpiped | muxpiped | {sshd,postfix}

What it does
------------

coverpipe is one component of a three part pipe allowing secure constant-cover
connections.

coverpipe/coverpiped will always try to send 1KB of data after a fixed
interval, currently 40 times per second.

If there isn't real data ready to be sent, it will pad that out with "cover"
data which the other end will silently ignore.

When more than 1KB of real data is ready, it will only send real data, not
cover data, but still at the normal intervals and sizes.

When combined with spiped the cover data is indistinguishable from real data,
so an observer can't distinguish between an idle and a fully utilised
connection.

The only thing an observer can know for certain is that real data is being sent
as slowly or slower than the spiped's bandwidth usage (which could still be
nothing during a network outage, or slower than normal).

Other components overview
-------------------------

The spiped we already know and love encrypts this data, making the cover
indistinguishable to the real data for an attacker. If the other end of the
spiped is itself malicious they can see what is cover and what is not, but
that's somewhat obvious.

[muxpipe](https://github.com/aliclark/muxpipedjs) is a utility that has 3
client operations and 2 server operations:

Open a connection and optionally if successful write some data to it. portid is
a pre-agreed index for the available ports.
[1] [uint15 len] [uint16 connid] [uint8 portid] [0-2^15 data...]

Write data to an existing connection
[0] [uint15 len] [uint16 connid] [1-2^15 data...]

Half-close an existing connection (like a FIN. RST is also mapped to this)
[0] [uint15 len = 0] [uint16 connid]

With this arrangement:

 - cover is shared between connections, which minimises overhead when idle.

 - the destination ports themselves can be hidden from the public internet,
   making spipe's authentication act as a firewall.

 - counterintuitively this can have lower latency than otherwise because the
   TCP connection is already handshaked, so data can be sent immediately.

Combining muxpipe and coverpipe into one utility would remove the duplicated
length field, but is initially separate for clarity and extensibility. In that
case muxpiped could use a connid of 0 to designate cover traffic.

Exit use-case
-------------

Although it's hoped that some day OpenSSL, Chrome, Firefox, Tor Browser, Tor
Hidden Services, and OpenVPN server/client will support cover functionality,
this may take some time.

A compromise is to add just the interval'd packet sending on top of them, to
reduce the potential of packet-to-packet correlation.

{firefox} | proxymux | coverpipe | spiped -e | ~~~~ | spiped -d | coverpiped | proxymuxd | ~~~

proxymuxd can serve this purpose, simply taking input traffic and sending it
out at a constant rate, or nothing otherwise.

Even with proxymuxd, dropped packets and transfer rates can deanonymise an
input connection, so this is really a stop-gap measure until client/server
software can be fixed.

What it does not
----------------

There is still the consideration about what happens afterwards - if there's an
uncovered connection onwards, then dropping coverpiped packets can show a
correlation in the other connection. Coverpiped doesn't magically ensure
anonymity in a larger system.

In this case:

 - coverpiped gracefully degrades to the anonymity of the rest of the internet,
   which is no better.

 - using end-to-end cover fixes this properly

 - this is mostly an active, not a passive attack (though a passive observer
   could observe natural packet loss), so takes more effort to perform

 - many use-cases don't have an onward connection, eg. locally terminated
   ssh-over-spiped connections, so aren't affected

More significantly, the terminating end must accept data as fast as it receives
it, to be effective. Otherwise, coverpiped will observe the backpressure and
not send data at all.

a) coverpiped could ignore backpressure and always write onwards, even if it
means buffering

b) coverpiped could implement a send window and ack system to give implied
feedback to the sender about when it can send more real data

c) do nothing - most onward connections will probably accept data immediately

(b) is more work but a better solution, since it passes along the feedback
instead of buffering indefinitely. I'm looking at similar ideas for muxpiped,
but for efficiency in that case.

TODO
----

 - Find a solution to an onward connection not accepting fast enough

 - Should TCP no-delay be considered to try to get some low latency back?

 - What are the best settings? High bandwidth gives more capacity for real
   data. Lower latency makes individual packet timings less significant. But
   high bandwidth is a waste when the connection is idle, and low latency might
   result in more packets and larger header overheads, especially at low
   bandwidth.

 - Add a mode to not send cover traffic, but otherwise forward data at
   regularised intervals to remove some timing info. This would only be useful
   for proxies since it actually adds a fingerprint (albeit different from the
   original fast-as-possible one).

Example
-------

piper.sh creates both the listen side and connecting side pipes on localhost
for testing.

To set up an encrypted 40KB/s constant cover pipe to localhost ssh and http,
use:

dd if=/dev/urandom bs=32 count=1 of=keyfile

./piper.sh -s 8022 -s 8080 -t 22 -t 80 -k keyfile

Then at any time secure, low latency http requests and ssh connections can be
made with no additional connection metadata being visible:

curl http://localhost:8080

ssh -p 8022 localhost
