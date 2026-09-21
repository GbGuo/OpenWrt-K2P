#!/bin/sh
# VMess needs Xray (~9–20MB). 16MB flash cannot hold it; unpack into /tmp.
BIN="/tmp/xray-root/usr/bin/xray"
LOG="/tmp/xray-ram.log"
LOCKDIR="/tmp/xray-ram.lock"
IPK="/tmp/xray-core.ipk"
ZIP="/tmp/xray.zip"

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }
[ -x "$BIN" ] && exit 0
if ! mkdir "$LOCKDIR" 2>/dev/null; then
	n=0
	while [ $n -lt 40 ] && [ ! -x "$BIN" ]; do sleep 2; n=$((n + 1)); done
	[ -x "$BIN" ] && exit 0
	exit 1
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

fetch() {
	log "get $1"
	if command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -T 60 -q -O "$2" "$1"
	else
		wget -T 60 -q -O "$2" "$1"
	fi
}

extract_ipk() {
	local dest="/tmp/xray-root"
	mkdir -p "$dest"
	if command -v ar >/dev/null 2>&1; then
		ar -p "$IPK" data.tar.gz 2>/dev/null | tar -xzf - -C "$dest" && return 0
	fi
	# Official OpenWrt often has no ar. Take the last gzip member (data.tar.gz).
	local off
	off=$(grep -aoba "$(printf '\037\213')" "$IPK" 2>/dev/null | tail -1 | cut -d: -f1)
	[ -n "$off" ] || return 1
	tail -c +"$((off + 1))" "$IPK" >/tmp/xray-data.tar.gz
	tar -xzf /tmp/xray-data.tar.gz -C "$dest"
}

install_zip() {
	mkdir -p /tmp/xray-zip /tmp/xray-root/usr/bin
	rm -rf /tmp/xray-zip/*
	unzip -o "$ZIP" -d /tmp/xray-zip >/dev/null 2>&1 || return 1
	if [ -f /tmp/xray-zip/xray ]; then
		cp -f /tmp/xray-zip/xray "$BIN"
		chmod +x "$BIN"
	fi
}

mkdir -p /tmp/xray-root/usr/bin /tmp/xray-idx

INDEX_URLS="
https://mirrors.ustc.edu.cn/immortalwrt/releases/24.10.4/packages/mipsel_24kc/packages
https://mirrors.zju.edu.cn/immortalwrt/releases/24.10.4/packages/mipsel_24kc/packages
https://mirrors.tuna.tsinghua.edu.cn/immortalwrt/releases/24.10.4/packages/mipsel_24kc/packages
https://downloads.immortalwrt.org/releases/24.10.4/packages/mipsel_24kc/packages
"
for base in $INDEX_URLS; do
	[ -n "$base" ] || continue
	if fetch "$base/Packages.gz" /tmp/xray-idx/Packages.gz && gzip -dc /tmp/xray-idx/Packages.gz >/tmp/xray-idx/Packages 2>/dev/null; then
		fn=$(awk '/^Package: xray-core$/{ok=1} ok && /^Filename:/{print $2; exit}' /tmp/xray-idx/Packages)
		if [ -n "$fn" ] && fetch "$base/$fn" "$IPK" && [ -s "$IPK" ]; then
			extract_ipk || true
			if [ -x "$BIN" ]; then
				log "installed $fn"
				rm -f "$IPK" /tmp/xray-data.tar.gz
				exit 0
			fi
			log "unpack failed for $fn (size=$(wc -c < "$IPK"))"
		fi
	fi
done

ZIP_URLS="
https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-mips32le.zip
https://gitdl.cn/https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-mips32le.zip
https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-mips32le.zip
"
for z in $ZIP_URLS; do
	[ -n "$z" ] || continue
	if fetch "$z" "$ZIP" && [ -s "$ZIP" ]; then
		install_zip || true
		if [ -x "$BIN" ]; then
			log "installed zip $z"
			rm -f "$ZIP"
			exit 0
		fi
	fi
done

log "failed to fetch Xray"
exit 1
