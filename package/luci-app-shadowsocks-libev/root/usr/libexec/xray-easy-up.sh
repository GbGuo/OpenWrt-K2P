#!/bin/sh
# Xray runtime manager for the "简易代理" page.
# Downloads xray-core + geoip/geosite to /tmp (RAM), starts a tproxy transparent
# proxy with a dedicated nftables chain, and configures dnsmasq to use xray's DNS.
# Called with no args -> start (based on uci state), or "stop" to tear down.

XRAY_DIR=/tmp/xray
XRAY_BIN=$XRAY_DIR/xray
XRAY_CFG=/tmp/xray-config.json
NFT_FILE=/etc/nftables.d/90-xray.nft
DNSMASQ_CONF=/tmp/dnsmasq.d/ss-official.conf
XRAY_VER=v1.8.23
XRAY_GITHUB="https://github.com/XTLS/Xray-core/releases/download/${XRAY_VER}/Xray-linux-mips32le.zip"
GEOIP_URL="https://github.com/v2fly/geoip/releases/latest/download/geoip-only-cn-private.dat"
GEOSITE_URL="https://github.com/v2fly/domain-list-community/releases/latest/download/geosite.dat"

mirror() {
	local m
	m=$(uci -q get shadowsocks-libev.easy.mirror 2>/dev/null)
	[ -n "$m" ] || m="https://gh-proxy.com/"
	echo "${m%/}/"
}

download() {
	local url="$1" out="$2" desc="$3" base u
	base=$(mirror)
	for u in "${base}${url}" "${url}"; do
		echo "fetch $desc: $u"
		if command -v curl >/dev/null 2>&1; then
			curl -fskL --connect-timeout 15 -m 600 -o "$out" "$u" 2>/dev/null && [ -s "$out" ] && return 0
		else
			wget --no-check-certificate -q --timeout=600 -O "$out" "$u" 2>/dev/null && [ -s "$out" ] && return 0
		fi
		rm -f "$out"
	done
	return 1
}

ensure_xray() {
	[ -x "$XRAY_BIN" ] && return 0
	mkdir -p "$XRAY_DIR"
	local zip=/tmp/xray.zip
	download "$XRAY_GITHUB" "$zip" "xray core" || return 1
	if command -v unzip >/dev/null 2>&1; then
		unzip -o -q "$zip" -d "$XRAY_DIR" || return 1
	else
		busybox unzip -o "$zip" -d "$XRAY_DIR" || return 1
	fi
	chmod +x "$XRAY_BIN" 2>/dev/null
	rm -f "$zip"
	"$XRAY_BIN" version >/dev/null 2>&1 || { echo "xray binary is not executable on this platform"; rm -f "$XRAY_BIN"; return 1; }
	echo "xray installed: $("$XRAY_BIN" version 2>/dev/null | head -1)"
}

ensure_dat() {
	mkdir -p "$XRAY_DIR"
	[ -s "$XRAY_DIR/geoip.dat" ] || download "$GEOIP_URL" "$XRAY_DIR/geoip.dat" "geoip.dat" || return 1
	[ -s "$XRAY_DIR/geosite.dat" ] || download "$GEOSITE_URL" "$XRAY_DIR/geosite.dat" "geosite.dat" || return 1
}

gen_nft() {
	local out=/tmp/xray-rules.nft
	cat >"$out" <<'EOF'
table inet xray {
	set byp4 {
		type ipv4_addr
		flags interval
		elements = { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.168.0.0/16, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4 }
	}
	chain prerouting {
		type filter hook prerouting priority mangle; policy accept;
		iifname != br-lan return
		ip daddr @byp4 return
		meta l4proto tcp meta mark set 1 tproxy to :1235
		meta l4proto udp meta mark set 1 tproxy to :1235
	}
}
EOF
	echo "table inet chk {include \"$out\";}" >/tmp/xray-nft.chk
	nft -f /tmp/xray-nft.chk -c || { echo "nft check failed"; return 1; }
	rm -f /tmp/xray-nft.chk /etc/nftables.d/90-ss-rules.nft
	mkdir -p /etc/nftables.d
	mv "$out" "$NFT_FILE"
	# policy routing for tproxy replies: fwmark 1 -> table 100 -> local dev lo
	while ip -4 rule del fwmark 1 lookup 100 2>/dev/null; do :; done
	ip -4 rule add fwmark 1 lookup 100
	ip -4 route flush table 100 2>/dev/null || true
	ip -4 route add local default dev lo table 100
	fw4 restart
}

reset_nft() {
	[ -f "$NFT_FILE" ] && { rm -f "$NFT_FILE"; fw4 restart; }
	# drop the policy routing table we added for tproxy
	while ip -4 rule del fwmark 1 lookup 100 2>/dev/null; do :; done
	ip -4 route flush table 100 2>/dev/null || true
}

stop_xray() {
	[ -f /tmp/xray.pid ] && kill "$(cat /tmp/xray.pid)" 2>/dev/null
	killall xray 2>/dev/null
	rm -f /tmp/xray.pid
	sleep 1
}

listen_on() {
	local port="$1"
	ss -ln 2>/dev/null | grep -q ":$port" || netstat -ln 2>/dev/null | grep -q ":$port"
}

stop() {
	stop_xray
	reset_nft
	rm -f "$DNSMASQ_CONF"
	/etc/init.d/dnsmasq restart >/dev/null 2>&1
	echo "xray stopped"
}

start() {
	# SS backend off while xray owns the ports
	/etc/init.d/shadowsocks-libev stop >/dev/null 2>&1
	stop_xray

	ensure_xray || { echo "ERROR: xray download failed"; return 1; }
	ensure_dat  || { echo "ERROR: dat download failed"; return 1; }
	gen_nft     || { echo "ERROR: nft gen failed"; return 1; }

	[ -s "$XRAY_CFG" ] || { echo "ERROR: missing $XRAY_CFG"; return 1; }
	XRAY_LOCATION_ASSET="$XRAY_DIR" "$XRAY_BIN" run -c "$XRAY_CFG" >/tmp/xray.log 2>&1 &
	echo $! >/tmp/xray.pid

	n=0
	while [ "$n" -lt 30 ]; do
		listen_on 8053 && break
		sleep 1
		n=$((n + 1))
	done

	if listen_on 8053; then
		mkdir -p /tmp/dnsmasq.d
		printf '%s\n' 'no-resolv' 'server=127.0.0.1#8053' >"$DNSMASQ_CONF"
		/etc/init.d/dnsmasq restart >/dev/null 2>&1
		echo "dns=8053"
	else
		rm -f "$DNSMASQ_CONF"
		/etc/init.d/dnsmasq restart >/dev/null 2>&1
		echo "dns=skipped (8053 not listening)"
	fi

	echo "mode=$(uci -q get shadowsocks-libev.easy.mode)"
	echo "xray: $(pidof xray || echo not-running)"
	echo "listen-1235: $(listen_on 1235 && ss -ln 2>/dev/null | grep ':1235' || echo none)"
	echo "listen-8053: $(listen_on 8053 && ss -ln 2>/dev/null | grep ':8053' || echo none)"
	[ -s /tmp/xray.log ] && tail -5 /tmp/xray.log
}

case "${1:-}" in
	stop)
		stop
		exit 0
		;;
esac

enabled=$(uci -q get shadowsocks-libev.easy.enabled)
[ "$enabled" = 1 ] || { stop; echo "proxy=off"; exit 0; }

start
