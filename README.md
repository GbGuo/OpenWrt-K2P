# Actions-OpenWrt-K2P

官方 OpenWrt **v24.10.8** + 官方 **Shadowsocks-libev**（只支持 SS，不含 VMess）。

24.10 软件源已经没有这个插件，所以固件里自带了 OpenWrt 23.05 的官方包。后台会出现 **服务**。

## 刷机

- Breed **斐讯布局**，只刷 `*squashfs-sysupgrade.bin`
- 后台：`http://192.168.1.1`

## 粘贴节点

1. **服务 → Shadowsocks-libev → 粘贴 SS**
2. 粘贴 `ss://`（一行一条）
3. 点 **保存并启用**
4. 状态里 `ss-redir` 要在跑，`listen-1234` 不能是 `none`
5. 电脑关掉 v2ray，再打开 `www.google.com`

不要贴 `vmess://`。带插件或 `2022-blake3` 的 SS 链接不会启用。
