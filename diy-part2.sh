#!/bin/bash
#
# Keep the official image small enough for K2P 16MB flash.
# Do not overlay custom packages — use feed luci-app-shadowsocks-libev.

sed -i 's/^CONFIG_TARGET_ROOTFS_INITRAMFS=y/# CONFIG_TARGET_ROOTFS_INITRAMFS is not set/' .config
grep -q '^CONFIG_TARGET_ROOTFS_SQUASHFS=y' .config || echo 'CONFIG_TARGET_ROOTFS_SQUASHFS=y' >> .config
grep -q '^CONFIG_SQUASHFS_XZ=y' .config || echo 'CONFIG_SQUASHFS_XZ=y' >> .config
