#!/bin/sh
# Start SS/VMess/VLESS from /tmp/ss-easy-ui.txt + UCI. Do not wait on Xray in the browser.
LOG=/tmp/ss-easy.log
log() { echo "$(date '+%F %T') $*" >>"$LOG"; echo "$*"; }

json_esc() { echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

if [ -f /tmp/ss-easy-ui.txt ]; then
	enabled=; mode=; node=
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in
			enabled=*) enabled=${line#enabled=} ;;
			mode=*) mode=${line#mode=} ;;
			node=*) node=${line#node=} ;;
			N	*)
				# N<tab>name<tab>proto<tab>alias<tab>host<tab>port<tab>method<tab>pass<tab>uuid<tab>aid<tab>net<tab>tls<tab>whost<tab>wpath
				name=$(printf '%s\n' "$line" | cut -f2)
				proto=$(printf '%s\n' "$line" | cut -f3)
				alias=$(printf '%s\n' "$line" | cut -f4)
				host=$(printf '%s\n' "$line" | cut -f5)
				port=$(printf '%s\n' "$line" | cut -f6)
				method=$(printf '%s\n' "$line" | cut -f7)
				pass=$(printf '%s\n' "$line" | cut -f8)
				uuid=$(printf '%s\n' "$line" | cut -f9)
				aid=$(printf '%s\n' "$line" | cut -f10)
				net=$(printf '%s\n' "$line" | cut -f11)
				tls=$(printf '%s\n' "$line" | cut -f12)
				whost=$(printf '%s\n' "$line" | cut -f13)
				wpath=$(printf '%s\n' "$line" | cut -f14)
				if [ "$proto" = ss ]; then
					uci -q set shadowsocks-libev."$name"=server
				else
					uci -q set shadowsocks-libev."$name"=ssnode
				fi
				uci -q set shadowsocks-libev."$name".protocol="$proto"
				uci -q set shadowsocks-libev."$name".alias="$alias"
				uci -q set shadowsocks-libev."$name".server="$host"
				uci -q set shadowsocks-libev."$name".server_port="$port"
				[ -n "$method" ] && uci -q set shadowsocks-libev."$name".method="$method"
				[ -n "$pass" ] && uci -q set shadowsocks-libev."$name".password="$pass"
				[ -n "$uuid" ] && uci -q set shadowsocks-libev."$name".uuid="$uuid"
				[ -n "$aid" ] && uci -q set shadowsocks-libev."$name".alter_id="$aid"
				[ -n "$net" ] && uci -q set shadowsocks-libev."$name".network="$net"
				[ -n "$tls" ] && uci -q set shadowsocks-libev."$name".tls="$tls"
				[ -n "$whost" ] && uci -q set shadowsocks-libev."$name".ws_host="$whost"
				[ -n "$wpath" ] && uci -q set shadowsocks-libev."$name".ws_path="$wpath"
				uci -q set shadowsocks-libev."$name".disabled=0
				;;
		esac
	done < /tmp/ss-easy-ui.txt
	uci -q set shadowsocks-libev.easy=easy
	[ -n "$enabled" ] && uci -q set shadowsocks-libev.easy.enabled="$enabled"
	[ -n "$mode" ] && uci -q set shadowsocks-libev.easy.mode="$mode"
	[ -n "$node" ] && uci -q set shadowsocks-libev.easy.node="$node"
	uci -q commit shadowsocks-libev
	log "imported ui dump enabled=$enabled mode=$mode node=$node"
fi

enabled=$(uci -q get shadowsocks-libev.easy.enabled)
node=$(uci -q get shadowsocks-libev.easy.node)
mode=$(uci -q get shadowsocks-libev.easy.mode)
proto=$(uci -q get shadowsocks-libev."$node".protocol)
[ -n "$proto" ] || proto=ss
log "apply enabled=$enabled node=$node proto=$proto mode=$mode"

mkdir -p /var/etc /var/run /tmp/dnsmasq.d
# Official init stop would kill these; start it first for nft, then ensure processes.
/etc/init.d/shadowsocks-libev restart >/tmp/ss-easy-restart.log 2>&1 || true
sleep 1

if [ "$enabled" != 1 ] || [ -z "$node" ]; then
	rm -f /tmp/dnsmasq.d/ss-easy.conf
	/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
	log "proxy off"
	/usr/libexec/ss-easy-status.sh
	exit 0
fi

host=$(uci -q get shadowsocks-libev."$node".server)
port=$(uci -q get shadowsocks-libev."$node".server_port)
method=$(uci -q get shadowsocks-libev."$node".method)
password=$(uci -q get shadowsocks-libev."$node".password)
log "remote $host:$port method=$method"

if [ "$proto" = ss ]; then
	if ! pidof ss-redir >/dev/null; then
		log "ss-redir missing after init, start by json"
		cat >/var/etc/ss-easy-redir.json <<EOF
{
  "server": "$(json_esc "$host")",
  "server_port": ${port:-0},
  "password": "$(json_esc "$password")",
  "method": "$(json_esc "${method:-aes-256-gcm}")",
  "local_address": "0.0.0.0",
  "local_port": 1234,
  "timeout": 60,
  "mode": "tcp_and_udp"
}
EOF
		cat >/var/etc/ss-easy-dns.json <<EOF
{
  "server": "$(json_esc "$host")",
  "server_port": ${port:-0},
  "password": "$(json_esc "$password")",
  "method": "$(json_esc "${method:-aes-256-gcm}")",
  "local_address": "127.0.0.1",
  "local_port": 8053,
  "tunnel_address": "8.8.8.8:53",
  "timeout": 60,
  "mode": "tcp_and_udp"
}
EOF
		[ -x /usr/bin/ss-redir ] && /usr/bin/ss-redir -c /var/etc/ss-easy-redir.json -u >>/tmp/ss-redir.log 2>&1 &
		[ -x /usr/bin/ss-tunnel ] && /usr/bin/ss-tunnel -c /var/etc/ss-easy-dns.json -u >>/tmp/ss-tunnel.log 2>&1 &
		sleep 1
	fi
	if pidof ss-tunnel >/dev/null; then
		printf '%s\n' 'no-resolv' 'server=127.0.0.1#8053' >/tmp/dnsmasq.d/ss-easy.conf
		/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
		log "dns -> 8053"
	else
		rm -f /tmp/dnsmasq.d/ss-easy.conf
		log "ss-tunnel not running, keep normal DNS"
	fi
	if pidof ss-redir >/dev/null; then
		log "ss-redir pid=$(pidof ss-redir)"
	else
		log "FAIL ss-redir still down; $(cat /tmp/ss-redir.log 2>/dev/null | tail -5)"
	fi
else
	# VMess / VLESS: fetch Xray in background if needed, then start.
	if [ ! -x /tmp/xray-root/usr/bin/xray ] && [ ! -x /usr/bin/xray ]; then
		log "xray missing, fetch background"
		( /usr/libexec/xray-ram-fetch.sh && /usr/libexec/ss-easy-apply.sh ) >>/tmp/xray-ram.log 2>&1 &
	else
		xray=/tmp/xray-root/usr/bin/xray
		[ -x "$xray" ] || xray=/usr/bin/xray
		if [ -s /var/etc/xray.json ]; then
			killall -q xray 2>/dev/null || true
			"$xray" run -c /var/etc/xray.json >>/tmp/xray-run.log 2>&1 &
			log "xray started $xray"
		else
			log "no /var/etc/xray.json"
		fi
	fi
fi

/usr/libexec/ss-easy-status.sh
exit 0
