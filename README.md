coverpiped
==========

{ssh,mutt} | pipemux | coverpipe | spiped -e | ~~~~ | spiped -d | coverpiped | pipemuxd | {sshd,postfix}

What it does
------------

coverpipe is one component of a three part pipe that allows secure
constant-cover connections.

coverpipe/coverpiped will always try to send 1KB of data after a fixed
interval, currently 40 times per second.

If there is not real data to send, it will pad out with "cover" data, which the
other end will silently ignore.

If more than 1KB of real data is ready, it will stop reading more input and
keep sending the real data at the intervals instead of cover data.

When combined with spiped, it becomes indistinguishable whether real data is
being sent, or if the connection is idle. The only information available is the
maximum rate that data could be transferred at.

The other components briefly
----------------------------

The spiped we already know and love encrypts this data, making the cover
indistinguishable to the real data for an attacker. If the other end of the
spiped is malicious they can see what is cover and what is not, but that's
somewhat obvious.

pipemux is a hypothesized utility that has 3 client operations and 2 server
operations:

Open a connection and optionally if successful write some data to it
[1] [uint15 len] [uint16 connid] [uint8 portid] [0-2^15 data...]

Write data to an existing connection
[0] [uint15 len] [uint16 connid] [1-2^15 data...]

Close an existing connection (like a FIN)
[0] [uint15 len = 0] [uint16 connid]

With this arrangement:

 - cover is shared between connections, which minimises overhead.

 - the destination ports themselves can be hidden from the public internet,
   making spipe's authentication act as a firewall

 - counterintuitively this has lower latency than otherwise, because the TCP
   connection is already handshaked, so data can be sent immediately

Combining pimemux and coverpipe into one utility would remove the duplicated
length field, but is initially separate for clarity and extensibility.

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

Even with proxymuxd dropped packets and transfer rates can deanonymise an input
connection, so this is really a stop-gap measure until the client/server
software can be fixed.

What it does not
----------------

There is still a consideration about what happens afterwards - if there is an
uncovered connection onwards then dropping coverpipe packets can show a
correlation in the other connection (coverpipe is not a magic fixer of all
anonymity in a system).

This is not an issue:

 - it gracefully degrades to the anonymity of the rest of the internet, which
   is no better.

 - using end-to-end cover closes this possibility

 - it's mostly an active, not a passive attack (though a passive observer could
   observe natural packet loss)

 - locally terminated applications like ssh and mutt do not necessarily have
   this onward connection, and are fine

In short, coverpipe is the best option even when used incorrectly, you should
use it.
