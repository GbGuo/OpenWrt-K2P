#!/bin/sh
# No Lua. OpenWrt 24 LuCI images often have no /usr/bin/lua.
OUT=/tmp/ss-easy-probe.txt
LOG=/tmp/ss-easy-probe.log
echo "probe $(date '+%F %T')" >"$LOG"
: >"$OUT"

ids=$(uci -q show shadowsocks-libev | sed -n 's/^shadowsocks-libev\.\([^.[:space:]]*\)=\(server\|ssnode\)$/\1/p')
echo "ids=$ids" >>"$LOG"

probe_one() {
	local id="$1" host="$2" port="$3" res p
	res=timeout
	if [ -z "$host" ]; then
		echo "$id=no-host" >>"$OUT"
		return
	fi
	p=$(ping -c 1 -W 2 "$host" 2>>"$LOG" | sed -n 's/.*time=\([0-9.]*\).*/\1/p' | head -1)
	if [ -n "$p" ]; then
		res="${p}ms"
	elif command -v uclient-fetch >/dev/null; then
		if uclient-fetch -q -T 2 -O /dev/null "http://${host}:${port:-80}" 2>/tmp/ss-easy-uf.err; then
			res=ok
		elif grep -qiE 'refused|SSL|certificate|redirect|Bad Gateway|timed out' /tmp/ss-easy-uf.err; then
			# refused/SSL means TCP reached the port
			if grep -qiE 'timed out|unreachable|No route' /tmp/ss-easy-uf.err; then
				res=timeout
			else
				res=ok
			fi
		fi
	fi
	echo "$id=$res" >>"$OUT"
	echo "$id host=$host port=$port -> $res" >>"$LOG"
}

if [ -z "$ids" ]; then
	echo "none=no-nodes" >>"$OUT"
	echo "no uci nodes" >>"$LOG"
else
	for id in $ids; do
		case "$id" in
			easy_remote|sss0|easy|easy_redir|easy_dns|ss_rules|hi|hj) continue ;;
		esac
		probe_one "$id" \
			"$(uci -q get shadowsocks-libev.$id.server)" \
			"$(uci -q get shadowsocks-libev.$id.server_port)"
	done
fi

[ -s "$OUT" ] || echo "none=empty" >"$OUT"
cat "$OUT"
echo "---- log ----"
cat "$LOG"
