#!/bin/sh
OUT=/tmp/ss-easy-status.txt
{
	echo "==== $(date '+%F %T') ===="
	echo "easy.enabled=$(uci -q get shadowsocks-libev.easy.enabled)"
	echo "easy.mode=$(uci -q get shadowsocks-libev.easy.mode)"
	echo "easy.node=$(uci -q get shadowsocks-libev.easy.node)"
	node=$(uci -q get shadowsocks-libev.easy.node)
	if [ -n "$node" ]; then
		echo "node.type=$(uci -q get shadowsocks-libev.$node)"
		echo "node.protocol=$(uci -q get shadowsocks-libev.$node.protocol)"
		echo "node.server=$(uci -q get shadowsocks-libev.$node.server)"
		echo "node.port=$(uci -q get shadowsocks-libev.$node.server_port)"
		echo "node.method=$(uci -q get shadowsocks-libev.$node.method)"
	fi
	echo "easy_redir.disabled=$(uci -q get shadowsocks-libev.easy_redir.disabled)"
	echo "easy_redir.server=$(uci -q get shadowsocks-libev.easy_redir.server)"
	echo "easy_dns.disabled=$(uci -q get shadowsocks-libev.easy_dns.disabled)"
	echo "ss_rules.disabled=$(uci -q get shadowsocks-libev.ss_rules.disabled)"
	echo "ss-redir: $(pidof ss-redir || echo not-running)"
	echo "ss-tunnel: $(pidof ss-tunnel || echo not-running)"
	echo "xray-bin: $([ -x /tmp/xray-root/usr/bin/xray ] && echo /tmp/xray-root/usr/bin/xray || echo missing)"
	echo "xray: $(pidof xray || echo not-running)"
	echo "listen-1234: $(netstat -ln 2>/dev/null | grep ':1234' || ss -ln 2>/dev/null | grep ':1234' || echo none)"
	echo "listen-8053: $(netstat -ln 2>/dev/null | grep ':8053' || ss -ln 2>/dev/null | grep ':8053' || echo none)"
	echo "---- /var/etc/shadowsocks-libev ----"
	ls -l /var/etc/shadowsocks-libev 2>/dev/null || echo "(empty)"
	echo "---- /tmp/ss-easy.log ----"
	tail -n 40 /tmp/ss-easy.log 2>/dev/null || echo "(none)"
	echo "---- /tmp/xray-ram.log ----"
	tail -n 40 /tmp/xray-ram.log 2>/dev/null || echo "(none)"
} >"$OUT"
cat "$OUT"
