#!/bin/bash

lport=""
services=""
keyfile=""

while getopts ":s::t::k:" opt; do
  case $opt in
    s)
	if [ -n "$lport" ]; then
		echo "-s must only be supplied once" >&2
		exit 1
	fi
	lport=$OPTARG
      ;;
    k)
      keyfile=$OPTARG
      ;;
    t)
      services="$services $OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

if [ -z "$lport" ]; then
    echo "Missing option -s" >&2
    exit 1
fi
if [ -z "$services" ]; then
    echo "Missing option -t" >&2
    exit 1
fi
if [ -z "$keyfile" ]; then
    echo "Missing option -k" >&2
    exit 1
fi

cleanup() {
    trap - INT TERM

    if [ -n "$muxlogf" ]; then
	rm -f -- "$muxlogf"
    fi
    if [ -n "$covlogf" ]; then
	rm -f -- "$covlogf"
    fi

    kill -- -$(ps -o pgid= $$ | grep -o [0-9]*)
}

trap cleanup INT TERM

echo 'starting...'

n=0
muxlogf=$(tempfile) || exit
nodejs ~/projects/muxpipedjs/muxpiped.js 0 $services >$muxlogf &
while [ -z "$muxp" ]; do
    muxp=$(head -n1 $muxlogf | cut -c 19-)
    if [[ $n -gt 10 ]]; then
	echo "Could not see port" >&2
	exit 1
    fi
    n=$((n+1))
    sleep 0.1
done
echo muxpiped is listening on $muxp "(terminates to${services})"

n=0
covlogf=$(tempfile) || exit
nodejs ~/projects/coverpipedjs/coverpiped.js 0 $muxp >$covlogf &
while [ -z "$covp" ]; do
    covp=$(head -n1 $covlogf | cut -c 19-)
    if [[ $n -gt 10 ]]; then
	echo "Could not see port" >&2
	exit 1
    fi
    n=$((n+1))
    sleep 0.1
done
echo coverpiped is listening on $covp "(terminates to $muxp)"

spiped -F -d -s "[0.0.0.0]:$lport" -t "[127.0.0.1]:$covp" -k "$keyfile" &

echo "spiped -d" is listening on $lport "(terminates to $covp)"

wait
