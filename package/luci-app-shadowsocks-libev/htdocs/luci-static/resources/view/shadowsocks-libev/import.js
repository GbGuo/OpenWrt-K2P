'use strict';
'require view';
'require uci';
'require ui';
'require fs';
'require shadowsocks-libev as ss';

var conf = 'shadowsocks-libev';
var latencies = {};

function parseProbe(text) {
	latencies = {};
	String(text || '').split(/\n/).forEach(function(line) {
		var m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
		if (m && m[1] !== 'none')
			latencies[m[1]] = m[2];
	});
}

function latencyText(id) {
	var v = latencies[id];
	if (v == null || v === '')
		return '—';
	if (/^\d/.test(v) && v.indexOf('ms') === -1)
		return v + ' ms';
	return v;
}

function skipName(name) {
	return name === 'sss0' || name === 'hi' || name === 'hj' || name === 'ss_rules' || name === 'easy';
}

function ensureEasy() {
	if (!uci.get(conf, 'easy'))
		uci.add(conf, 'easy', 'easy');
}

function nodes() {
	var list = [];
	uci.sections(conf, 'server', function(s) {
		if (s && s['.name'] && !skipName(s['.name']) && s.server && s.server_port)
			list.push(s);
	});
	return list;
}

function sectionName(type, prefer) {
	var found = null;
	uci.sections(conf, type, function(s) {
		if (!found && (!prefer || s['.name'] === prefer))
			found = s['.name'];
	});
	return found;
}

/* ---------- base64 / link parsing ---------- */

function b64decode(s) {
	s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4)
		s += '=';
	try { return atob(s); } catch (e) { return null; }
}

function parseVmess(uri) {
	var body = uri.slice('vmess://'.length);
	var json = b64decode(body);
	if (!json) return null;
	var o;
	try { o = JSON.parse(json); } catch (e) { return null; }
	if (!o || !o.add || !o.port || !o.id) return null;
	var cfg = {
		proto: 'vmess',
		server: o.add,
		server_port: String(o.port),
		uuid: o.id,
		aid: (o.aid != null) ? String(o.aid) : '0',
		scy: o.scy || 'auto',
		net: o.net || 'tcp',
		type: o.type || 'none',
		tls: (o.tls === 'tls') ? 'tls' : 'none',
		host: o.host || '',
		path: o.path || '',
		sni: o.sni || '',
		alpn: o.alpn || '',
		fp: o.fp || ''
	};
	return [cfg, o.ps || ''];
}

function queryParams(s) {
	var params = {};
	String(s || '').split('&').forEach(function(p) {
		var j = p.indexOf('=');
		if (j !== -1) {
			var k = p.slice(0, j), v = p.slice(j + 1);
			try { k = decodeURIComponent(k); v = decodeURIComponent(v); } catch (e) {}
			params[k] = v;
		}
	});
	return params;
}

function splitHostPort(hostport) {
	var colonPos = hostport.lastIndexOf(':');
	if (colonPos === -1) return null;
	return {
		host: hostport.slice(0, colonPos),
		port: hostport.slice(colonPos + 1).replace(/[^\d].*$/, '')
	};
}

function parseVless(uri) {
	var rest = uri.slice('vless://'.length);
	var hashPos = rest.indexOf('#');
	var tag = hashPos !== -1 ? rest.slice(hashPos + 1) : '';
	if (hashPos !== -1) rest = rest.slice(0, hashPos);
	var atPos = rest.indexOf('@');
	if (atPos === -1) return null;
	var uuid = rest.slice(0, atPos);
	var qPos = rest.indexOf('?');
	var hp = splitHostPort(qPos !== -1 ? rest.slice(atPos + 1, qPos) : rest.slice(atPos + 1));
	var params = queryParams(qPos !== -1 ? rest.slice(qPos + 1) : '');
	if (!uuid || !hp || !hp.host || !hp.port) return null;
	var sec = params.security || 'none';
	var cfg = {
		proto: 'vless',
		server: hp.host,
		server_port: hp.port,
		uuid: uuid,
		net: params.type || 'tcp',
		tls: (sec === 'tls') ? 'tls' : (sec === 'reality' ? 'reality' : 'none'),
		host: params.host || '',
		path: params.path || '',
		sni: params.sni || '',
		fp: params.fp || '',
		flow: params.flow || '',
		pbk: params.pbk || '',
		sid: params.sid || ''
	};
	return [cfg, tag];
}

function parseTrojan(uri) {
	var rest = uri.slice('trojan://'.length);
	var hashPos = rest.indexOf('#');
	var tag = hashPos !== -1 ? rest.slice(hashPos + 1) : '';
	if (hashPos !== -1) rest = rest.slice(0, hashPos);
	var atPos = rest.indexOf('@');
	if (atPos === -1) return null;
	var password = rest.slice(0, atPos);
	var qPos = rest.indexOf('?');
	var hp = splitHostPort(qPos !== -1 ? rest.slice(atPos + 1, qPos) : rest.slice(atPos + 1));
	var params = queryParams(qPos !== -1 ? rest.slice(qPos + 1) : '');
	if (!password || !hp || !hp.host || !hp.port) return null;
	var sec = params.security || 'tls';
	var cfg = {
		proto: 'trojan',
		server: hp.host,
		server_port: hp.port,
		password: password,
		net: params.type || 'tcp',
		tls: (sec === 'tls') ? 'tls' : 'none',
		host: params.host || '',
		path: params.path || '',
		sni: params.sni || '',
		fp: params.fp || ''
	};
	return [cfg, tag];
}

function parseLink(line) {
	if (/^ss:\/\//i.test(line)) {
		var r = ss.parse_uri(line);
		if (r && r[0]) {
			r[0].proto = 'ss';
			return r;
		}
		return null;
	}
	if (/^vmess:\/\//i.test(line)) return parseVmess(line);
	if (/^vless:\/\//i.test(line)) return parseVless(line);
	if (/^trojan:\/\//i.test(line)) return parseTrojan(line);
	return null;
}

function protoLabel(p) {
	return ({ ss: 'SS', vmess: 'VMess', vless: 'VLESS', trojan: 'Trojan' })[p] || 'SS';
}

/* ---------- xray config builders ---------- */

function buildStreamSettings(node) {
	var net = node.net || 'tcp';
	var sni = node.sni || node.server;
	var host = node.host || node.server;
	var st = { network: net };
	if (net === 'ws')
		st.wsSettings = { path: node.path || '/', headers: { Host: host } };
	else if (net === 'grpc')
		st.grpcSettings = { serviceName: node.path || '' };

	if (node.tls === 'reality') {
		st.security = 'reality';
		st.realitySettings = {
			serverName: node.sni || '',
			publicKey: node.pbk || '',
			shortId: node.sid || '',
			fingerprint: node.fp || 'chrome'
		};
	} else if (node.tls === 'tls') {
		st.security = 'tls';
		st.tlsSettings = { serverName: sni, allowInsecure: false };
	} else {
		st.security = 'none';
	}
	return st;
}

function buildOutbound(node) {
	var port = parseInt(node.server_port, 10) || 443;
	var out = {
		tag: 'proxy',
		protocol: node.proto,
		settings: {},
		streamSettings: buildStreamSettings(node)
	};
	if (node.proto === 'vmess') {
		out.settings.vnext = [{
			address: node.server,
			port: port,
			users: [{ id: node.uuid, security: node.scy || 'auto', alterId: parseInt(node.aid || '0', 10) || 0 }]
		}];
	} else if (node.proto === 'vless') {
		out.settings.vnext = [{
			address: node.server,
			port: port,
			users: [{ id: node.uuid, encryption: 'none', flow: node.flow || '' }]
		}];
	} else if (node.proto === 'trojan') {
		out.settings.servers = [{ address: node.server, port: port, password: node.password || '' }];
	}
	return out;
}

function buildXrayConfig(node, mode) {
	var rules = [
		{ type: 'field', inboundTag: ['dns-in'], outboundTag: 'proxy' },
		{ type: 'field', protocol: ['bittorrent'], outboundTag: 'direct' },
		{ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }
	];
	if (mode === 'bypass') {
		rules.push({ type: 'field', domain: ['geosite:cn'], outboundTag: 'direct' });
		rules.push({ type: 'field', ip: ['geoip:cn'], outboundTag: 'direct' });
	}
	return {
		log: { loglevel: 'warning' },
		inbounds: [
			{
				tag: 'tproxy-in',
				port: 1235,
				listen: '0.0.0.0',
				protocol: 'dokodemo-door',
				settings: { network: 'tcp,udp', followRedirect: true },
				sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
				streamSettings: { sockopt: { tproxy: 'tproxy' } }
			},
			{
				tag: 'dns-in',
				port: 8053,
				listen: '127.0.0.1',
				protocol: 'dokodemo-door',
				settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
			}
		],
		outbounds: [
			buildOutbound(node),
			{ tag: 'direct', protocol: 'freedom', settings: {}, streamSettings: { sockopt: { mark: 255 } } }
		],
		routing: { domainStrategy: 'IPIfNonMatch', rules: rules }
	};
}

/* ---------- view ---------- */

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return Promise.all([
			uci.load(conf),
			fs.read('/tmp/ss-easy-probe.txt').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		parseProbe(data && data[1] || '');
		ensureEasy();

		var statusBox = E('pre', {
			id: 'k2p-status',
			style: 'white-space:pre-wrap;font-size:12px;max-height:18em;overflow:auto;background:#111;color:#ddd;padding:8px'
		}, '还没有状态。粘贴节点、点「添加节点」，勾选开关后点「保存并应用」。');

		var enabledBox = E('input', { type: 'checkbox', id: 'k2p-on' });
		enabledBox.checked = uci.get(conf, 'easy', 'enabled') === '1';

		var modeBox = E('select', { id: 'k2p-mode', class: 'cbi-input-select' }, [
			E('option', { value: 'bypass' }, '绕过大陆（国内直连，国外走代理）'),
			E('option', { value: 'global' }, '全局代理')
		]);
		modeBox.value = uci.get(conf, 'easy', 'mode') || 'bypass';

		var mirrorBox = E('input', {
			id: 'k2p-mirror',
			class: 'cbi-input-text',
			style: 'width:100%;font-family:monospace;box-sizing:border-box'
		});
		mirrorBox.value = uci.get(conf, 'easy', 'mirror') || 'https://gh-proxy.com/';

		var curLabel = E('strong', { id: 'k2p-cur' }, '');
		var tableBody = E('tbody');
		var linksBox = E('textarea', {
			id: 'k2p-links',
			style: 'width:100%;height:8em;font-family:monospace;box-sizing:border-box',
			placeholder: '粘贴多个节点，每行一个，支持 ss:// / vmess:// / vless:// / trojan://'
		});

		function currentId() {
			return uci.get(conf, 'easy', 'node') || '';
		}

		function currentNode() {
			var cur = currentId();
			var found = null;
			nodes().forEach(function(s) { if (s['.name'] === cur) found = s; });
			return found;
		}

		function refresh() {
			var cur = currentId();
			var list = nodes();
			var found = null;
			list.forEach(function(s) {
				if (s['.name'] === cur)
					found = s;
			});
			if (!found && list.length) {
				found = list[list.length - 1];
				uci.set(conf, 'easy', 'node', found['.name']);
				cur = found['.name'];
			}
			curLabel.textContent = found
				? (protoLabel(found.proto || 'ss') + '  ' + (found.alias || found['.name']) + '  ' + found.server + ':' + found.server_port)
				: '还没有节点，先在下面粘贴链接并点「添加节点」';

			tableBody.innerHTML = '';
			list.forEach(function(s) {
				var id = s['.name'];
				var selected = id === cur;
				var useBtn = E('button', {
					class: selected ? 'btn cbi-button-apply' : 'btn',
					click: function() {
						uci.set(conf, 'easy', 'node', id);
						refresh();
					}
				}, selected ? '当前使用' : '选用');
				tableBody.appendChild(E('tr', { style: selected ? 'background:#e8f4ff' : '' }, [
					E('td', {}, protoLabel(s.proto || 'ss')),
					E('td', {}, s.alias || id),
					E('td', {}, s.server || ''),
					E('td', {}, String(s.server_port || '')),
					E('td', {}, latencyText(id)),
					E('td', {}, [useBtn, ' ', E('button', {
						class: 'btn',
						click: function() {
							uci.remove(conf, id);
							if (currentId() === id)
								uci.set(conf, 'easy', 'node', '');
							refresh();
						}
					}, '删除')])
				]));
			});
		}

		function importText(text) {
			var ok = 0, bad = [], last = null;
			String(text || '').split(/\r?\n/).forEach(function(line) {
				line = String(line || '').replace(/^\s+|\s+$/g, '');
				if (!line)
					return;
				var r = parseLink(line);
				if (!r || !r[0] || !r[0].server || !r[0].server_port) {
					bad.push('无法识别: ' + line.slice(0, 40));
					return;
				}
				var cfg = r[0];
				cfg.server_port = String(cfg.server_port).replace(/[^\d].*$/, '');
				if (!cfg.server_port) {
					bad.push(line.slice(0, 48));
					return;
				}
				if (cfg.proto === 'ss') {
					if (cfg.plugin) { bad.push('带插件 SS，跳过: ' + line.slice(0, 32)); return; }
					if (/^2022-/.test(cfg.method || '')) { bad.push('SS2022 不支持: ' + (cfg.method || '')); return; }
				}
				var tag = r[1];
				try { tag = tag ? decodeURIComponent(tag) : ''; } catch (e) { tag = r[1] || ''; }
				var sidName = (/^[A-Za-z0-9_]+$/.test(tag)) ? tag : null;
				var sid = uci.add(conf, 'server', sidName);
				Object.keys(cfg).forEach(function(k) {
					uci.set(conf, sid, k, cfg[k]);
				});
				uci.set(conf, sid, 'disabled', '0');
				if (tag)
					uci.set(conf, sid, 'alias', tag);
				last = sid;
				ok++;
			});
			if (last)
				uci.set(conf, 'easy', 'node', last);
			return { ok: ok, bad: bad, last: last };
		}

		// write the SS backend sections (enable/disable ss-redir/ss-tunnel/ss-rules + bind node)
		function applyRules(on, node) {
			var redir = sectionName('ss_redir', 'hi') || sectionName('ss_redir');
			var tun = sectionName('ss_tunnel');
			var mode = modeBox.value || 'bypass';
			uci.set(conf, 'hj', 'disabled', '1');
			uci.set(conf, 'sss0', 'disabled', '1');
			if (redir) {
				uci.set(conf, redir, 'disabled', on ? '0' : '1');
				if (node)
					uci.set(conf, redir, 'server', node);
				uci.set(conf, redir, 'local_address', '0.0.0.0');
				uci.set(conf, redir, 'local_port', '1234');
				uci.set(conf, redir, 'mode', 'tcp_and_udp');
			}
			if (tun) {
				uci.set(conf, tun, 'disabled', on ? '0' : '1');
				if (node)
					uci.set(conf, tun, 'server', node);
				uci.set(conf, tun, 'local_address', '127.0.0.1');
				uci.set(conf, tun, 'local_port', '8053');
				uci.set(conf, tun, 'tunnel_address', '8.8.8.8:53');
				uci.set(conf, tun, 'mode', 'tcp_and_udp');
			}
			uci.set(conf, 'ss_rules', 'disabled', on ? '0' : '1');
			uci.set(conf, 'ss_rules', 'redir_tcp', redir || 'hi');
			uci.set(conf, 'ss_rules', 'redir_udp', redir || 'hi');
			uci.set(conf, 'ss_rules', 'ifnames', 'br-lan');
			uci.unset(conf, 'ss_rules', 'src_ips_forward');
			uci.unset(conf, 'ss_rules', 'dst_ips_forward');
			if (mode === 'global') {
				uci.set(conf, 'ss_rules', 'src_default', 'forward');
				uci.set(conf, 'ss_rules', 'dst_default', 'forward');
				uci.set(conf, 'ss_rules', 'local_default', 'forward');
				uci.unset(conf, 'ss_rules', 'dst_ips_bypass_file');
			} else {
				uci.set(conf, 'ss_rules', 'src_default', 'checkdst');
				uci.set(conf, 'ss_rules', 'dst_default', 'forward');
				uci.set(conf, 'ss_rules', 'local_default', 'checkdst');
				uci.set(conf, 'ss_rules', 'dst_ips_bypass_file', '/usr/share/ss-easy/chnroute.txt');
			}
		}

		function saveState() {
			uci.set(conf, 'easy', 'enabled', enabledBox.checked ? '1' : '0');
			uci.set(conf, 'easy', 'mode', modeBox.value || 'bypass');
			uci.set(conf, 'easy', 'mirror', mirrorBox.value || 'https://gh-proxy.com/');
		}

		function applyAll() {
			ensureEasy();
			var on = enabledBox.checked;
			var node = currentNode();
			var proto = node ? (node.proto || 'ss') : 'ss';

			if (on && !currentId()) {
				ui.addNotification(null, E('p', '请先点「选用」选一个节点'), 'warning');
				return;
			}

			saveState();
			applyRules(false, null);   // SS backend off by default; re-enabled below when SS chosen

			if (!on) {
				statusBox.textContent = '正在关闭代理…';
				return uci.save().then(function() {
					return fs.exec('/usr/libexec/xray-easy-up.sh', ['stop'], null, 30000);
				}).then(function() {
					return fs.exec('/usr/libexec/ss-official-up.sh', [], null, 40000);
				}).then(function(res) {
					statusBox.textContent = (res && res.stdout) || '代理已关闭。';
					ui.addNotification(null, E('p', '代理已关闭。'), 'info');
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			}

			if (proto === 'ss') {
				applyRules(true, node['.name']);
				statusBox.textContent = '正在保存并启动 SS，请等几秒。';
				return uci.save().then(function() {
					return fs.exec('/usr/libexec/ss-official-up.sh', [], null, 40000);
				}).then(function(res) {
					statusBox.textContent = (res && res.stdout) || '已保存';
					ui.addNotification(null, E('p', 'SS 代理已按当前开关和模式启动。'), 'info');
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			}

			// xray path: vmess / vless / trojan
			var cfg = buildXrayConfig(node, modeBox.value || 'bypass');
			statusBox.textContent = '正在下载/启动 Xray…（首次约 10MB，需 1-2 分钟，请耐心等待）';
			return uci.save().then(function() {
				return fs.write('/tmp/xray-config.json', JSON.stringify(cfg, null, 2));
			}).then(function() {
				return fs.exec('/usr/libexec/xray-easy-up.sh', [], null, 180000);
			}).then(function(res) {
				statusBox.textContent = (res && res.stdout) || '已保存';
				ui.addNotification(null, E('p', protoLabel(proto) + ' 代理已按当前开关和模式启动。'), 'info');
			}).catch(function(err) {
				statusBox.textContent = '启动失败：' + String(err) + '\n可点「测试延迟」或查看 /tmp/xray.log。';
			});
		}

		var addBtn = E('button', {
			class: 'btn cbi-button-action',
			click: ui.createHandlerFn(this, function() {
				ensureEasy();
				var r = importText(linksBox.value);
				refresh();
				return uci.save().then(function() {
					linksBox.value = '';
					var msg = '已添加 ' + r.ok + ' 个节点。点「选用」，再点「保存并应用」。';
					if (r.bad.length)
						msg += '\n跳过：' + r.bad.join(' | ');
					if (!r.ok)
						msg = '没有读到有效链接。' + (r.bad.length ? '\n' + r.bad.join(' | ') : '');
					ui.addNotification(null, E('p', msg), r.ok ? 'info' : 'warning');
					refresh();
				});
			})
		}, '添加节点');

		var applyBtn = E('button', {
			class: 'btn cbi-button-apply',
			click: ui.createHandlerFn(this, applyAll)
		}, '保存并应用');

		var probeBtn = E('button', {
			class: 'btn',
			click: ui.createHandlerFn(this, function() {
				statusBox.textContent = '正在测每个节点到路由器的 TCP 延迟…';
				return fs.exec('/usr/libexec/ss-easy-probe.sh', [], null, 60000).then(function(res) {
					var out = (res && res.stdout) || '';
					return fs.read('/tmp/ss-easy-probe.txt').catch(function() { return out; }).then(function(fileOut) {
						parseProbe(fileOut || out);
						statusBox.textContent = fileOut || out || ('探测没有输出。code=' + (res && res.code));
						refresh();
					});
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			})
		}, '测试延迟');

		refresh();

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, '简易代理'),
			E('p', {}, '粘贴多个节点自动识别 ss / vmess / vless / trojan。SS 走内置 ss-redir，其余走运行时下载的 Xray。'),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '开关'),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '启用代理'),
					E('div', { class: 'cbi-value-field' }, enabledBox)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '访问模式'),
					E('div', { class: 'cbi-value-field' }, modeBox)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '当前节点'),
					E('div', { class: 'cbi-value-field' }, curLabel)
				])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '添加节点'),
				E('p', {}, '每行一个链接，一次性粘贴多个。'),
				linksBox,
				E('div', { style: 'margin-top:8px' }, [addBtn, ' ', applyBtn, ' ', probeBtn])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '节点列表（点选用）'),
				E('table', { class: 'table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, '协议'),
						E('th', {}, '名称'),
						E('th', {}, '地址'),
						E('th', {}, '端口'),
						E('th', {}, '延迟'),
						E('th', {}, '操作')
					])),
					tableBody
				])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '运行状态'),
				E('p', {}, 'SS 看 ss-redir 与 listen-1234；Xray 看 xray 与 listen-1235。关掉开关再点「保存并应用」会停掉代理。'),
				statusBox
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '下载源'),
				E('p', {}, 'Xray 内核与 geoip/geosite 数据的下载镜像前缀（国内可达）。默认公共镜像，挂了可自己换成别的 gh 加速前缀。'),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '镜像前缀'),
					E('div', { class: 'cbi-value-field' }, mirrorBox)
				])
			])
		]);
	}
});
