#!/bin/sh

sources=""
services=""
keyfile=""

while getopts ":s::t::k:" opt; do
  case $opt in
    s)
      sources="$sources -s $OPTARG"
      ;;
    k)
      keyfile=$OPTARG
      ;;
    t)
      services="$services -t $OPTARG"
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

if [ -z "$sources" ]; then
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

    kill -- -$(ps -o pgid= $$ | grep -o [0-9]*)
    exit
}

trap cleanup INT TERM

sport="$(( ((RANDOM<<15)|RANDOM) % 63001 + 2000 ))"

./listener.sh -s $sport $services -k $keyfile &
sleep 3
./connector.sh -t $sport $sources -k $keyfile &

wait
