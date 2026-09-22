# Actions-OpenWrt-K2P

官方 OpenWrt **v24.10.8** + 官方 Shadowsocks-libev。页面按简易代理来用，只支持 `ss://`。

## 刷机

- Breed **斐讯布局**，只刷 `*squashfs-sysupgrade.bin`
- 后台：`http://192.168.1.1`

## 使用

1. **服务 → Shadowsocks-libev → 简易代理**
2. 粘贴 `ss://`，点 **添加节点**
3. 点 **选用**
4. 勾选 **启用代理**
5. 访问模式选 **绕过大陆** 或 **全局代理**
6. 点 **保存并应用**
7. 状态里 `ss-redir` 要在跑，`listen-1234` 不能是 `none`

关掉代理：取消「启用代理」，再点一次「保存并应用」。不要贴 `vmess://`。
