# Actions-OpenWrt-K2P

官方 OpenWrt **v24.10.8** + 官方 Shadowsocks-libev + 运行时 Xray。页面按简易代理来用，支持 `ss://` / `vmess://` / `vless://` / `trojan://`。

- **SS**：走内置官方 shadowsocks-libev（`ss-redir` + `ss-tunnel` + `ss-rules`），最快。
- **VMess / VLESS / Trojan**：点「保存并应用」时从国内镜像**下载 Xray 到内存**（`/tmp`），用 tproxy 透明代理 + `geosite:cn` 分流。每次重启路由器需重新下载（约 10MB）。

## 刷机

- Breed **斐讯布局**，只刷 `*squashfs-sysupgrade.bin`
- 后台：`http://192.168.1.1`

## 使用

1. **服务 → Shadowsocks-libev → 简易代理**
2. 粘贴一个或多个节点链接（每行一个），点 **添加节点**
3. 点 **选用**（自动识别协议）
4. 勾选 **启用代理**，访问模式选 **绕过大陆** 或 **全局代理**
5. 点 **保存并应用**
   - 选 SS：状态里 `ss-redir` 要在跑，`listen-1234` 不能是 `none`
   - 选 VMess/VLESS/Trojan：首次会下载 Xray，状态里 `xray` 要在跑，`listen-1235` 不能是 `none`
6. 若公共镜像下载失败，在页面底部「下载源」换成其它 `gh` 加速前缀后重试

关掉代理：取消「启用代理」，再点一次「保存并应用」。
