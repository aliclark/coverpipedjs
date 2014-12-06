#!/bin/bash

tport=""
sources=""
keyfile=""

while getopts ":s::t::k:" opt; do
  case $opt in
    s)
	sources="$sources $OPTARG"
      ;;
    k)
      keyfile=$OPTARG
      ;;
    t)
	  if [ -n "$tport" ]; then
	      echo "-t must only be supplied once" >&2
	      exit 1
	  fi
	  tport=$OPTARG
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

if [ -z "$tport" ]; then
    echo "Missing option -t" >&2
    exit 1
fi
if [ -z "$sources" ]; then
    echo "Missing option -s" >&2
    exit 1
fi
if [ -z "$keyfile" ]; then
    echo "Missing option -k" >&2
    exit 1
fi

cleanup() {
    trap - INT TERM

    if [ -n "$covlogf" ]; then
	rm -f -- "$covlogf"
    fi

    kill -- -$(ps -o pgid= $$ | grep -o [0-9]*)
}

trap cleanup INT TERM

echo 'starting...'

sport="$(( ((RANDOM<<15)|RANDOM) % 63001 + 2000 ))"

spiped -F -e -s "[127.0.0.1]:$sport" -t "[127.0.0.1]:$tport" -k "$keyfile" &

echo "spiped -e" listening on $sport "(terminates to $tport)"

n=0
covlogf=$(tempfile) || exit
nodejs ~/projects/coverpipedjs/coverpipe.js $sport 0 >$covlogf &
while [ -z "$covp" ]; do
    covp=$(head -n1 $covlogf | cut -c 19-)
    if [[ $n -gt 10 ]]; then
	echo "Could not see port" >&2
	exit 1
    fi
    n=$((n+1))
    sleep 0.1
done
echo coverpipe listening on $covp "(terminates to $sport)"

nodejs ~/projects/muxpipedjs/muxpipe.js $covp $sources &
echo muxpipe listening on $sources "(terminates $covp)"

wait
