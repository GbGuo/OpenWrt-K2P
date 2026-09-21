#!/bin/sh
# Import UI dump into UCI, then let the init script start proxy + nft.
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
				plugin=$(printf '%s\n' "$line" | cut -f15)
				plugin_opts=$(printf '%s\n' "$line" | cut -f16)
				[ -n "$name" ] || continue
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
				[ -n "$plugin" ] && uci -q set shadowsocks-libev."$name".plugin="$plugin"
				[ -n "$plugin_opts" ] && uci -q set shadowsocks-libev."$name".plugin_opts="$plugin_opts"
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

log "restart shadowsocks-libev"
/etc/init.d/shadowsocks-libev restart >/tmp/ss-easy-restart.log 2>&1 || true
sleep 2
/usr/libexec/ss-easy-status.sh
exit 0
