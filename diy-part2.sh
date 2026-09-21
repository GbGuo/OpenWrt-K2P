#!/bin/bash
#
# Keep the official image small enough for K2P 16MB flash.
# Copy vendored Shadowsocks packages into the OpenWrt tree.

sed -i 's/^CONFIG_TARGET_ROOTFS_INITRAMFS=y/# CONFIG_TARGET_ROOTFS_INITRAMFS is not set/' .config
grep -q '^CONFIG_TARGET_ROOTFS_SQUASHFS=y' .config || echo 'CONFIG_TARGET_ROOTFS_SQUASHFS=y' >> .config
grep -q '^CONFIG_SQUASHFS_XZ=y' .config || echo 'CONFIG_SQUASHFS_XZ=y' >> .config

SRC="$GITHUB_WORKSPACE/package"
if [ -d "$SRC" ]; then
  mkdir -p package
  rm -rf package/feeds/luci/luci-app-shadowsocks-libev \
    feeds/luci/applications/luci-app-shadowsocks-libev
  cp -a "$SRC"/. package/
fi
