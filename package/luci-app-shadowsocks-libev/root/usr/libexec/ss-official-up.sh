#!/bin/sh
# Apply official shadowsocks-libev from the easy page. No LuCI uci/apply.
enabled=$(uci -q get shadowsocks-libev.easy.enabled)
/etc/init.d/shadowsocks-libev enable >/dev/null 2>&1 || true
/etc/init.d/shadowsocks-libev restart
if [ "$enabled" != 1 ]; then
	rm -f /tmp/dnsmasq.d/ss-official.conf
	/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
	echo "proxy=off"
	echo "ss-redir: $(pidof ss-redir || echo not-running)"
	exit 0
fi
n=0
while [ "$n" -lt 15 ]; do
	if netstat -ln 2>/dev/null | grep -q ':8053' || ss -ln 2>/dev/null | grep -q ':8053'; then
		mkdir -p /tmp/dnsmasq.d
		printf '%s\n' 'no-resolv' 'server=127.0.0.1#8053' >/tmp/dnsmasq.d/ss-official.conf
		/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
		echo "dns=8053"
		break
	fi
	n=$((n + 1))
	sleep 1
done
echo "mode=$(uci -q get shadowsocks-libev.easy.mode)"
echo "ss-redir: $(pidof ss-redir || echo not-running)"
echo "ss-tunnel: $(pidof ss-tunnel || echo not-running)"
echo "listen-1234: $(netstat -ln 2>/dev/null | grep ':1234' || ss -ln 2>/dev/null | grep ':1234' || echo none)"
echo "listen-8053: $(netstat -ln 2>/dev/null | grep ':8053' || ss -ln 2>/dev/null | grep ':8053' || echo none)"
exit 0
