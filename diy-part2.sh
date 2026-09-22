#!/bin/bash
#
# K2P 16MB: squashfs only. Official shadowsocks-libev is vendored under package/
# because OpenWrt 24.10 feeds no longer ship it.

sed -i 's/^CONFIG_TARGET_ROOTFS_INITRAMFS=y/# CONFIG_TARGET_ROOTFS_INITRAMFS is not set/' .config
grep -q '^CONFIG_TARGET_ROOTFS_SQUASHFS=y' .config || echo 'CONFIG_TARGET_ROOTFS_SQUASHFS=y' >> .config
grep -q '^CONFIG_SQUASHFS_XZ=y' .config || echo 'CONFIG_SQUASHFS_XZ=y' >> .config
