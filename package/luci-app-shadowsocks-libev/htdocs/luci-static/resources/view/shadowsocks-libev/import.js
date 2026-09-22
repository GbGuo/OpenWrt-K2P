'use strict';
'require view';
'require uci';
'require ui';
'require fs';
'require shadowsocks-libev as ss';

var conf = 'shadowsocks-libev';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return uci.load(conf);
	},

	render: function() {
		var box = E('textarea', {
			style: 'width:100%;height:8em;font-family:monospace;box-sizing:border-box',
			placeholder: 'ss://......'
		});
		var status = E('pre', {
			style: 'white-space:pre-wrap;font-size:12px;background:#111;color:#ddd;padding:8px'
		}, '把 ss:// 贴在上面，点「保存并启用」。只支持 Shadowsocks，不要贴 vmess://。不要点右上角黄色栏。');

		function sectionName(type, prefer) {
			var found = null;
			uci.sections(conf, type, function(s) {
				if (!found && (!prefer || s['.name'] === prefer))
					found = s['.name'];
			});
			return found;
		}

		var btn = E('button', {
			class: 'btn cbi-button-apply',
			click: ui.createHandlerFn(this, function() {
				var ok = 0, bad = [], last = null;
				String(box.value || '').split(/\r?\n/).forEach(function(line) {
					line = String(line || '').replace(/^\s+|\s+$/g, '');
					if (!line)
						return;
					var parsed = ss.parse_uri(line);
					if (!parsed || !parsed[0] || !parsed[0].server || !parsed[0].server_port) {
						bad.push(line.slice(0, 48));
						return;
					}
					var cfg = parsed[0];
					if (cfg.plugin) {
						bad.push('带插件，跳过: ' + line.slice(0, 32));
						return;
					}
					if (/^2022-/.test(cfg.method || '')) {
						bad.push('SS2022 不支持: ' + (cfg.method || ''));
						return;
					}
					cfg.server_port = String(cfg.server_port).replace(/[^\d].*$/, '');
					if (!cfg.server_port) {
						bad.push(line.slice(0, 48));
						return;
					}
					var tag = parsed[1];
					try { tag = tag ? decodeURIComponent(tag) : null; } catch (e) {}
					if (!tag || !/^[A-Za-z0-9_]+$/.test(tag))
						tag = null;
					var sid = uci.add(conf, 'server', tag);
					Object.keys(cfg).forEach(function(k) {
						if (cfg[k] != null && cfg[k] !== '')
							uci.set(conf, sid, k, String(cfg[k]));
					});
					uci.set(conf, sid, 'disabled', '0');
					last = sid;
					ok++;
				});
				if (!last) {
					status.textContent = '没有读到可用的 ss://。' + (bad.length ? '\n' + bad.join('\n') : '');
					return;
				}
				var redir = sectionName('ss_redir', 'hi') || sectionName('ss_redir');
				var tun = sectionName('ss_tunnel');
				if (redir) {
					uci.set(conf, redir, 'disabled', '0');
					uci.set(conf, redir, 'server', last);
					uci.set(conf, redir, 'local_address', '0.0.0.0');
					uci.set(conf, redir, 'local_port', '1234');
					uci.set(conf, redir, 'mode', 'tcp_and_udp');
					uci.set(conf, 'ss_rules', 'disabled', '0');
					uci.set(conf, 'ss_rules', 'redir_tcp', redir);
					uci.set(conf, 'ss_rules', 'redir_udp', redir);
					uci.set(conf, 'ss_rules', 'ifnames', 'br-lan');
					uci.set(conf, 'ss_rules', 'src_default', 'forward');
					uci.set(conf, 'ss_rules', 'dst_default', 'forward');
					uci.set(conf, 'ss_rules', 'local_default', 'forward');
					uci.unset(conf, 'ss_rules', 'src_ips_forward');
					uci.unset(conf, 'ss_rules', 'dst_ips_forward');
				}
				if (tun) {
					uci.set(conf, tun, 'disabled', '0');
					uci.set(conf, tun, 'server', last);
					uci.set(conf, tun, 'local_address', '127.0.0.1');
					uci.set(conf, tun, 'local_port', '8053');
					uci.set(conf, tun, 'tunnel_address', '8.8.8.8:53');
					uci.set(conf, tun, 'mode', 'tcp_and_udp');
				}
				status.textContent = '已写入 ' + ok + ' 个节点，正在启动…';
				return uci.save().then(function() {
					return fs.exec('/usr/libexec/ss-official-up.sh', [], null, 40000);
				}).then(function(res) {
					box.value = '';
					status.textContent = ((res && res.stdout) || '已启动') +
						(bad.length ? '\n跳过：\n' + bad.join('\n') : '') +
						'\nss-redir 要在跑，listen-1234 不能是 none。电脑关掉 v2ray 再打开 www.google.com。';
				}).catch(function(err) {
					status.textContent = String(err);
				});
			})
		}, '保存并启用');

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, '粘贴 SS'),
			E('p', {}, '官方 Shadowsocks。把 ss:// 贴进来即可，会打开透明代理。VMess 不要贴。'),
			box,
			E('div', { style: 'margin-top:8px' }, btn),
			E('h3', {}, '状态'),
			status
		]);
	}
});
