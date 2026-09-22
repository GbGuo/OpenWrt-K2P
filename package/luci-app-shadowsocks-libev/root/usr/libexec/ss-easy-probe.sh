#!/bin/sh
# TCP connect latency. Stdout is only id=value lines.
OUT=/tmp/ss-easy-probe.txt
: >"$OUT"
now_ms() { awk '{printf "%d", $1 * 1000}' /proc/uptime; }

ids=$(uci -q show shadowsocks-libev | sed -n 's/^shadowsocks-libev\.\([^.[:space:]]*\)=server$/\1/p')
if [ -z "$ids" ]; then
	echo "none=no-nodes" >"$OUT"
	cat "$OUT"
	exit 0
fi

for id in $ids; do
	case "$id" in
		sss0|hi|hj|easy|ss_rules) continue ;;
	esac
	host=$(uci -q get shadowsocks-libev.$id.server)
	port=$(uci -q get shadowsocks-libev.$id.server_port)
	if [ -z "$host" ] || [ -z "$port" ]; then
		echo "$id=no-host" >>"$OUT"
		continue
	fi
	ip=$host
	echo "$host" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || ip=$(resolveip -t 2 -4 "$host" 2>/dev/null | head -1)
	if [ -z "$ip" ]; then
		echo "$id=dns-fail" >>"$OUT"
		continue
	fi
	t1=$(now_ms)
	if nc -z -w 2 "$ip" "$port" >/dev/null 2>&1; then
		t2=$(now_ms)
		ms=$((t2 - t1))
		[ "$ms" -lt 1 ] && ms=1
		echo "$id=${ms}ms" >>"$OUT"
	else
		echo "$id=timeout" >>"$OUT"
	fi
done
[ -s "$OUT" ] || echo "none=empty" >"$OUT"
cat "$OUT"
