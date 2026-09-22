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
		if (s && s['.name'] && !skipName(s['.name']) && s.server)
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
		}, '还没有状态。勾选开关、选好模式和节点后，点「保存并应用」。');

		var enabledBox = E('input', { type: 'checkbox', id: 'k2p-on' });
		enabledBox.checked = uci.get(conf, 'easy', 'enabled') === '1';

		var modeBox = E('select', { id: 'k2p-mode', class: 'cbi-input-select' }, [
			E('option', { value: 'bypass' }, '绕过大陆（国内直连，国外走代理）'),
			E('option', { value: 'global' }, '全局代理')
		]);
		modeBox.value = uci.get(conf, 'easy', 'mode') || 'bypass';

		var curLabel = E('strong', { id: 'k2p-cur' }, '');
		var tableBody = E('tbody');
		var linksBox = E('textarea', {
			id: 'k2p-links',
			style: 'width:100%;height:8em;font-family:monospace;box-sizing:border-box',
			placeholder: 'ss://.....'
		});

		function currentId() {
			return uci.get(conf, 'easy', 'node') || '';
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
				? ('SS  ' + (found.alias || found['.name']) + '  ' + found.server + ':' + found.server_port)
				: '还没有节点，先在下面粘贴 ss://';

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
					E('td', {}, 'SS'),
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
				if (/^vmess:\/\//i.test(line) || /^vless:\/\//i.test(line)) {
					bad.push('不是 SS: ' + line.slice(0, 32));
					return;
				}
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
				try { tag = tag ? decodeURIComponent(tag) : ''; } catch (e) { tag = parsed[1] || ''; }
				var sidName = (/^[A-Za-z0-9_]+$/.test(tag)) ? tag : null;
				var sid = uci.add(conf, 'server', sidName);
				uci.set(conf, sid, 'disabled', '0');
				uci.set(conf, sid, 'server', cfg.server);
				uci.set(conf, sid, 'server_port', cfg.server_port);
				uci.set(conf, sid, 'method', cfg.method || 'aes-256-gcm');
				uci.set(conf, sid, 'password', cfg.password || '');
				if (tag)
					uci.set(conf, sid, 'alias', tag);
				last = sid;
				ok++;
			});
			if (last)
				uci.set(conf, 'easy', 'node', last);
			return { ok: ok, bad: bad, last: last };
		}

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
						msg = '没有读到 ss://。' + (r.bad.length ? '\n' + r.bad.join(' | ') : '');
					ui.addNotification(null, E('p', msg), r.ok ? 'info' : 'warning');
					refresh();
				});
			})
		}, '添加节点');

		var applyBtn = E('button', {
			class: 'btn cbi-button-apply',
			click: ui.createHandlerFn(this, function() {
				ensureEasy();
				if (enabledBox.checked && !currentId()) {
					ui.addNotification(null, E('p', '请先点「选用」选一个节点'), 'warning');
					return;
				}
				uci.set(conf, 'easy', 'enabled', enabledBox.checked ? '1' : '0');
				uci.set(conf, 'easy', 'mode', modeBox.value || 'bypass');
				applyRules(enabledBox.checked, currentId());
				statusBox.textContent = '正在保存并启动，请等几秒。不要点右上角黄色栏。';
				return uci.save().then(function() {
					return fs.exec('/usr/libexec/ss-official-up.sh', [], null, 40000);
				}).then(function(res) {
					statusBox.textContent = (res && res.stdout) || '已保存';
					ui.addNotification(null, E('p', enabledBox.checked ? '代理已按当前开关和模式启动。' : '代理已关闭。'), 'info');
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			})
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
			E('p', {}, '只支持 ss://。打开「启用代理」，选「绕过大陆」或「全局代理」，选用节点后点「保存并应用」。'),
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
				E('p', {}, '把 ss:// 贴在下面。不要贴 vmess://。'),
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
				E('p', {}, 'ss-redir 要在跑，listen-1234 不能是 none。关掉开关再点「保存并应用」会停掉代理。'),
				statusBox
			])
		]);
	}
});
