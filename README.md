# Actions-OpenWrt-K2P

官方 OpenWrt **v24.10.8** + 简化 Shadowsocks / VMess。

## 刷机

- Breed **斐讯布局**，只刷 `*squashfs-sysupgrade.bin`
- 后台：`http://192.168.1.1`

## 使用

1. **服务 → Shadowsocks**
2. 在 **添加节点** 框粘贴 `ss://` 或 `vmess://`（一行一条，自动识别）
3. **保存并应用**
4. 在 **当前节点** 里选刚导入的节点
5. 打开 **启用代理**，模式选绕过大陆或全局
6. 再点一次 **保存并应用**

VMess 需要 Xray，16MB 闪存放不下，第一次启用 VMess 会从国内镜像下载到内存（约 1 分钟）。Shadowsocks 不需要下载。
