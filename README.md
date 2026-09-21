# Actions-OpenWrt-K2P

官方 OpenWrt **v24.10.8** + 官方 **luci-app-shadowsocks-libev**（仅 Shadowsocks，不含 VMess）。

## 刷机

- Breed **斐讯布局**，只刷 `*squashfs-sysupgrade.bin`
- 后台：`http://192.168.1.1`

## 使用（服务 → Shadowsocks）

只支持 `ss://` 那种节点（aes-256-gcm / chacha20-ietf-poly1305 等）。电脑上的 VMess 节点不要往这里填。

1. **远程服务器**：添加，填地址、端口、密码、加密方法，保存
2. **透明代理 (ss-redir)**：启用，服务器选上一步，本地端口 `1234`，模式 `tcp_and_udp`
3. **访问控制 (ss-rules)**：启用，TCP/UDP 重定向都选这个 ss-redir；接口填 `br-lan`；若整网都走代理，来源默认和目标默认都选 **转发**
4. **保存并应用**
5. 电脑不要再开 v2ray，用路由器上网再打开 `www.google.com`

DNS 可选：再开 **隧道 (ss-tunnel)**，本地 `127.0.0.1:8053`，隧道地址 `8.8.8.8:53`，然后在 DHCP/dnsmasq 里把 DNS 指到 `127.0.0.1#8053`。
