#
# Copyright (C) 2017 Yousong Zhou <yszhou4tech@gmail.com>
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI K2P proxy (k2p-proxy-v11)
LUCI_DEPENDS:=+luci-base +shadowsocks-libev-config +shadowsocks-libev-ss-redir +shadowsocks-libev-ss-tunnel +shadowsocks-libev-ss-rules +unzip
PKG_VERSION:=11
PKG_RELEASE:=1
LUCI_DEPENDS:=+luci-base +shadowsocks-libev-config +shadowsocks-libev-ss-redir +shadowsocks-libev-ss-tunnel +shadowsocks-libev-ss-rules +unzip

PKG_LICENSE:=Apache-2.0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
