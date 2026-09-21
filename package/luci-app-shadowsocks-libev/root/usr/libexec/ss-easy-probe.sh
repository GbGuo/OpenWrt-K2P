#!/bin/sh
# TCP connect latency (not ICMP). Stdout is only id=value lines for the LuCI table.
OUT=/tmp/ss-easy-probe.txt
LOG=/tmp/ss-easy-probe.log
echo "probe $(date '+%F %T')" >"$LOG"
: >"$OUT"

now_ms() { awk '{printf "%d", $1 * 1000}' /proc/uptime; }

ids=$(uci -q show shadowsocks-libev | sed -n 's/^shadowsocks-libev\.\([^.[:space:]]*\)=\(server\|ssnode\)$/\1/p')
echo "ids=$ids" >>"$LOG"

tcp_ms() {
	local host="$1" port="$2" t1 t2 ms err ip
	[ -n "$host" ] && [ -n "$port" ] || { echo "no-host"; return; }
	ip=$host
	echo "$host" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || \
		ip=$(resolveip -t 2 -4 "$host" 2>>"$LOG" | head -1)
	[ -n "$ip" ] || { echo "dns-fail"; return; }
	t1=$(now_ms)
	err=/tmp/ss-easy-tcp.$port.err
	if command -v nc >/dev/null 2>&1; then
		if nc -z -w 2 "$ip" "$port" >/dev/null 2>>"$LOG"; then
			t2=$(now_ms)
			ms=$((t2 - t1))
			[ "$ms" -lt 1 ] && ms=1
			echo "${ms}ms"
			return
		fi
		echo "timeout"
		return
	fi
	if command -v uclient-fetch >/dev/null 2>&1; then
		if uclient-fetch -q -T 2 -O /dev/null "http://${ip}:${port}/" 2>"$err"; then
			t2=$(now_ms); ms=$((t2 - t1)); [ "$ms" -lt 1 ] && ms=1
			echo "${ms}ms"
			return
		fi
		if grep -qiE 'timed out|unreachable|Name or service|Bad address|No route' "$err" 2>/dev/null; then
			echo "timeout"
			return
		fi
		# Connection happened (refused after handshake, HTTP error, SSL, reset).
		t2=$(now_ms); ms=$((t2 - t1)); [ "$ms" -lt 1 ] && ms=1
		echo "${ms}ms"
		return
	fi
	echo "no-tool"
}

if [ -z "$ids" ]; then
	echo "none=no-nodes" >>"$OUT"
	echo "no uci nodes" >>"$LOG"
else
	for id in $ids; do
		case "$id" in
			easy_remote|sss0|easy|easy_redir|easy_dns|ss_rules|hi|hj) continue ;;
		esac
		host=$(uci -q get shadowsocks-libev.$id.server)
		port=$(uci -q get shadowsocks-libev.$id.server_port)
		res=$(tcp_ms "$host" "$port")
		echo "$id=$res" >>"$OUT"
		echo "$id host=$host port=$port -> $res" >>"$LOG"
	done
fi

[ -s "$OUT" ] || echo "none=empty" >"$OUT"
cat "$OUT"
