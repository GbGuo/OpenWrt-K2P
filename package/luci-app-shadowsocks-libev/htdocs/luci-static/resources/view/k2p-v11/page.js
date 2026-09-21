'use strict';
'require view';
'require uci';
'require ui';
'require fs';

var conf = 'shadowsocks-libev';
var PAGE = 'k2p-proxy-v13';
var latencies = {};

function parseProbe(text) {
	latencies = {};
	String(text || '').split(/\n/).forEach(function(line) {
		var m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
		if (m && m[1] !== 'none' && m[1] !== 'ids')
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

function b64decode(s) {
	if (s == null)
		return null;
	s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
	if (!s)
		return null;
	s += '==='.slice((s.length + 3) % 4);
	try {
		var bin = atob(s);
		try {
			return decodeURIComponent(escape(bin));
		} catch (e) {
			return bin;
		}
	} catch (e) {
		return null;
	}
}

function normMethod(m) {
	m = String(m || '').trim().toLowerCase().replace(/_/g, '-');
	var map = {
		'aead-aes-128-gcm': 'aes-128-gcm',
		'aead-aes-192-gcm': 'aes-192-gcm',
		'aead-aes-256-gcm': 'aes-256-gcm',
		'aead-chacha20-ietf-poly1305': 'chacha20-ietf-poly1305',
		'aead-chacha20-poly1305': 'chacha20-ietf-poly1305',
		'chacha20-poly1305': 'chacha20-ietf-poly1305',
		'xchacha20-poly1305': 'xchacha20-ietf-poly1305'
	};
	return map[m] || m;
}

function parseHostPort(hp) {
	hp = String(hp || '').replace(/\/+$/, '');
	if (hp.charAt(0) === '[') {
		var end = hp.indexOf(']');
		if (end !== -1)
			return { host: hp.slice(1, end), port: hp.slice(end + 1).replace(/^:/, '') };
	}
	var c = hp.lastIndexOf(':');
	if (c === -1)
		return null;
	return { host: hp.slice(0, c), port: hp.slice(c + 1) };
}

function parseQuery(q) {
	var params = {};
	String(q || '').split('&').forEach(function(s) {
		if (!s)
			return;
		var k = s.indexOf('=');
		var key, val;
		try {
			key = decodeURIComponent(k === -1 ? s : s.slice(0, k));
			val = decodeURIComponent(k === -1 ? '' : s.slice(k + 1));
		} catch (e) {
			key = k === -1 ? s : s.slice(0, k);
			val = k === -1 ? '' : s.slice(k + 1);
		}
		params[key] = val;
	});
	return params;
}

function parseSs(uri) {
	uri = String(uri || '').trim();
	if (!/^ss:\/\//i.test(uri))
		return null;
	var rest = uri.replace(/^ss:\/\//i, '');
	var tag = '', hashPos = rest.lastIndexOf('#');
	if (hashPos !== -1) {
		try {
			tag = decodeURIComponent(rest.slice(hashPos + 1));
		} catch (e) {
			tag = rest.slice(hashPos + 1);
		}
		rest = rest.slice(0, hashPos);
	}

	var userinfo, hostport, plugin = '', plugin_opts = '';
	var at = rest.lastIndexOf('@');
	if (at !== -1) {
		userinfo = rest.slice(0, at);
		hostport = rest.slice(at + 1);
		var decoded = b64decode(userinfo);
		if (decoded && decoded.indexOf(':') !== -1)
			userinfo = decoded;
		else {
			try {
				userinfo = decodeURIComponent(userinfo);
			} catch (e) {}
		}
	} else {
		var plain = b64decode(rest);
		if (!plain)
			return null;
		var a = plain.lastIndexOf('@');
		if (a === -1)
			return null;
		userinfo = plain.slice(0, a);
		hostport = plain.slice(a + 1);
		tag = tag || '';
	}

	var qPos = hostport.indexOf('?');
	var slashPos = hostport.indexOf('/');
	var query = '';
	if (qPos !== -1 && (slashPos === -1 || qPos < slashPos || slashPos < qPos)) {
		query = hostport.slice(qPos + 1);
		hostport = hostport.slice(0, qPos);
	} else if (slashPos !== -1) {
		var after = hostport.slice(slashPos + 1);
		hostport = hostport.slice(0, slashPos);
		if (after.charAt(0) === '?')
			query = after.slice(1);
		else if (after.indexOf('?') !== -1)
			query = after.slice(after.indexOf('?') + 1);
	}
	hostport = hostport.replace(/\/+$/, '');
	var hp = parseHostPort(hostport);
	if (!hp || !hp.host || !hp.port)
		return null;
	var port = String(hp.port).replace(/[^\d]/g, '');
	if (!port)
		return null;

	var colon = userinfo.indexOf(':');
	if (colon === -1)
		return null;
	var method = normMethod(userinfo.slice(0, colon));
	var password = userinfo.slice(colon + 1);
	if (!method || !password)
		return null;

	if (query) {
		var params = parseQuery(query);
		if (params.plugin) {
			var pv = params.plugin;
			var sc = pv.indexOf(';');
			if (sc !== -1) {
				plugin = pv.slice(0, sc);
				plugin_opts = pv.slice(sc + 1);
			} else {
				plugin = pv;
			}
		}
	}

	var cfg = {
		protocol: 'ss',
		server: hp.host,
		server_port: port,
		method: method,
		password: password,
		alias: tag || (hp.host + ':' + port)
	};
	if (plugin)
		cfg.plugin = plugin;
	if (plugin_opts)
		cfg.plugin_opts = plugin_opts;
	return cfg;
}

function parseVmessJson(o, tag) {
	if (!o || typeof o !== 'object')
		return null;
	var host = o.add || o.addr || o.address || o.host || o.server;
	var port = o.port;
	var id = o.id || o.uuid;
	if (!host || port == null || !id)
		return null;
	var net = o.net || o.network || o.type || 'tcp';
	if (net === 'none')
		net = 'tcp';
	var tls = String(o.tls || o.security || '');
	if (tls === 'xtls' || tls === 'reality')
		tls = 'tls';
	if (tls !== 'tls')
		tls = (tls === '1' || tls === 'true') ? 'tls' : '';
	return {
		protocol: 'vmess',
		server: String(host),
		server_port: String(port),
		uuid: String(id),
		password: String(id),
		alter_id: String(o.aid != null ? o.aid : (o.alterId != null ? o.alterId : 0)),
		network: String(net),
		tls: tls,
		ws_host: String(o.host || o.sni || o.peer || ''),
		ws_path: String(o.path || ''),
		method: String(o.scy || o.security || o.cipher || 'auto'),
		alias: tag || o.ps || o.remark || o.name || (host + ':' + port)
	};
}

function parseVmessShare(raw, tag) {
	var at = raw.indexOf('@');
	if (at < 1)
		return null;
	var uuid = raw.slice(0, at);
	var rest = raw.slice(at + 1);
	var q = rest.indexOf('?');
	var hp = parseHostPort(q === -1 ? rest : rest.slice(0, q));
	if (!hp || !hp.host || !hp.port)
		return null;
	var params = parseQuery(q === -1 ? '' : rest.slice(q + 1));
	var security = params.security || params.tls || '';
	var net = params.type || params.net || 'tcp';
	return {
		protocol: 'vmess',
		server: hp.host,
		server_port: String(hp.port).replace(/[^\d]/g, ''),
		uuid: uuid,
		password: uuid,
		alter_id: String(params.aid || params.alterId || 0),
		network: net,
		tls: (security === 'tls' || security === 'xtls') ? 'tls' : (security === 'none' ? '' : security),
		ws_host: params.host || params.sni || '',
		ws_path: params.path || '',
		method: params.encryption || params.scy || params.security || 'auto',
		alias: tag || (hp.host + ':' + hp.port)
	};
}

function parseVmess(uri) {
	var raw = String(uri || '').trim().replace(/^vmess1:\/\//i, 'vmess://');
	if (!/^vmess:\/\//i.test(raw))
		return null;
	raw = raw.replace(/^vmess:\/\//i, '');
	var tag = '', hashPos = raw.lastIndexOf('#');
	if (hashPos !== -1 && raw.indexOf('{') !== 0) {
		try {
			tag = decodeURIComponent(raw.slice(hashPos + 1));
		} catch (e) {
			tag = raw.slice(hashPos + 1);
		}
		raw = raw.slice(0, hashPos);
	}
	try {
		raw = decodeURIComponent(raw);
	} catch (e) {}

	if (raw.charAt(0) === '{') {
		try {
			return parseVmessJson(JSON.parse(raw), tag);
		} catch (e) {
			return null;
		}
	}

	if (raw.indexOf('@') !== -1 && raw.indexOf('eyJ') !== 0)
		return parseVmessShare(raw, tag);

	var text = b64decode(raw);
	if (!text)
		return null;
	text = String(text).replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
	if (text.charAt(0) === '{') {
		try {
			return parseVmessJson(JSON.parse(text), tag);
		} catch (e) {
			return null;
		}
	}
	if (text.indexOf('@') !== -1)
		return parseVmessShare(text, tag);
	return null;
}

function parseRawJsonMaybe(text) {
	text = String(text || '').replace(/^\s+|\s+$/g, '');
	if (text.charAt(0) !== '{') {
		var dec = b64decode(text);
		if (dec && dec.charAt(0) === '{')
			text = dec;
		else
			return null;
	}
	try {
		return parseVmessJson(JSON.parse(text));
	} catch (e) {
		return null;
	}
}

function parseVless(uri) {
	var raw = String(uri || '').replace(/^vless:\/\//i, '');
	var tag = '', hashPos = raw.lastIndexOf('#');
	if (hashPos !== -1) {
		try {
			tag = decodeURIComponent(raw.slice(hashPos + 1));
		} catch (e) {
			tag = raw.slice(hashPos + 1);
		}
		raw = raw.slice(0, hashPos);
	}
	var share = parseVmessShare(raw, tag);
	if (!share)
		return null;
	share.protocol = 'vless';
	share.method = 'none';
	return share;
}

function parseLink(line) {
	line = String(line || '').replace(/^\uFEFF/, '').replace(/^["'\s]+|["'\s]+$/g, '');
	if (!line || line.charAt(0) === '#')
		return null;
	var compact = line.replace(/\s+/g, '');
	var low = compact.toLowerCase();
	var vless = low.indexOf('vless://');
	if (vless !== -1)
		return parseVless(compact.slice(vless));
	var j = low.indexOf('vmess://');
	var k = low.indexOf('vmess1://');
	if (k !== -1 && (j === -1 || k < j))
		j = k;
	if (j !== -1)
		return parseVmess(compact.slice(j).replace(/^vmess1:\/\//i, 'vmess://'));
	var i = low.indexOf('ss://');
	if (i !== -1)
		return parseSs(compact.slice(i));
	return parseRawJsonMaybe(line) || parseRawJsonMaybe(compact);
}

function splitLinks(text) {
	var raw = String(text || '').replace(/\r/g, '\n').replace(/vmess1:\/\//gi, 'vmess://');
	var out = [];
	var re = /vless:\/\/[^\s]+|vmess:\/\/[^\s]+|ss:\/\/[^\s]+/gi;
	var m;
	while ((m = re.exec(raw)))
		out.push(m[0]);
	if (!out.length && raw.replace(/\s+/g, ''))
		out.push(raw.replace(/^\s+|\s+$/g, ''));
	return out;
}

function ensureEasy() {
	if (!uci.get(conf, 'easy'))
		uci.add(conf, 'easy', 'easy');
}

function skipName(name) {
	return name === 'easy_remote' || name === 'sss0' || name === 'easy_redir' || name === 'easy_dns' || name === 'ss_rules' || name === 'easy' || name === 'hi' || name === 'hj';
}

function nodes() {
	var list = [];
	['ssnode', 'server'].forEach(function(type) {
		uci.sections(conf, type, function(s) {
			if (s && s['.name'] && !skipName(s['.name']) && s.server)
				list.push(s);
		});
	});
	return list;
}

function importText(text) {
	var ok = 0, bad = [], last = null;
	splitLinks(text).forEach(function(line) {
		var parsed = parseLink(line);
		if (!parsed || !parsed.server || !parsed.server_port) {
			bad.push(line.replace(/\s+/g, ' ').slice(0, 64));
			return;
		}
		var sid = uci.add(conf, parsed.protocol === 'ss' ? 'server' : 'ssnode');
		uci.set(conf, sid, 'disabled', '0');
		Object.keys(parsed).forEach(function(k) {
			if (parsed[k] != null && parsed[k] !== '')
				uci.set(conf, sid, k, String(parsed[k]));
		});
		last = sid;
		ok++;
	});
	if (last)
		uci.set(conf, 'easy', 'node', last);
	return { ok: ok, bad: bad, last: last };
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return Promise.all([
			uci.load(conf),
			L.resolveDefault(fs.read('/tmp/ss-easy-status.txt'), ''),
			L.resolveDefault(fs.read('/tmp/ss-easy-probe.txt'), '')
		]);
	},

	render: function(data) {
		ensureEasy();
		parseProbe(data && data[2] || '');
		var statusBox = E('pre', {
			id: 'k2p-status',
			style: 'white-space:pre-wrap;font-size:12px;max-height:18em;overflow:auto;background:#111;color:#ddd;padding:8px'
		}, (data && data[1]) || _('还没有状态。点「保存并应用」或「测试延迟」。'));

		var enabledBox = E('input', { type: 'checkbox', id: 'k2p-on' });
		enabledBox.checked = uci.get(conf, 'easy', 'enabled') === '1';

		var modeBox = E('select', { id: 'k2p-mode', class: 'cbi-input-select' }, [
			E('option', { value: 'bypass' }, _('绕过大陆（国内直连，国外走代理）')),
			E('option', { value: 'global' }, _('全局代理'))
		]);
		modeBox.value = uci.get(conf, 'easy', 'mode') || 'bypass';

		var curLabel = E('strong', { id: 'k2p-cur' }, '');
		var tableBody = E('tbody');
		var linksBox = E('textarea', {
			id: 'k2p-links',
			style: 'width:100%;height:8em;font-family:monospace;box-sizing:border-box',
			placeholder: 'ss://.....\nvmess://.....'
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
				? ((found.protocol || 'ss').toUpperCase() + '  ' + (found.alias || found['.name']) + '  ' + found.server + ':' + found.server_port)
				: _('还没有节点，先在下面粘贴链接');

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
				}, selected ? _('当前使用') : _('选用'));
				tableBody.appendChild(E('tr', { style: selected ? 'background:#e8f4ff' : '' }, [
					E('td', {}, (s.protocol || 'ss').toUpperCase()),
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
					}, _('删除'))])
				]));
			});
		}

		function persist(doApply) {
			ensureEasy();
			uci.set(conf, 'easy', 'enabled', enabledBox.checked ? '1' : '0');
			uci.set(conf, 'easy', 'mode', modeBox.value);
			if (!uci.get(conf, 'easy', 'node') && nodes().length)
				uci.set(conf, 'easy', 'node', nodes()[nodes().length - 1]['.name']);
			var lines = [
				'enabled=' + (enabledBox.checked ? '1' : '0'),
				'mode=' + (modeBox.value || 'bypass'),
				'node=' + (uci.get(conf, 'easy', 'node') || '')
			];
			nodes().forEach(function(s) {
				lines.push([
					'N', s['.name'], s.protocol || 'ss', s.alias || '', s.server || '',
					s.server_port || '', s.method || '', s.password || '', s.uuid || '',
					s.alter_id || '', s.network || '', s.tls || '', s.ws_host || '', s.ws_path || '',
					s.plugin || '', s.plugin_opts || ''
				].join('\t'));
			});
			var dump = lines.join('\n') + '\n';
			return fs.write('/tmp/ss-easy-ui.txt', dump).catch(function() {}).then(function() {
				return uci.save().catch(function() {});
			});
		}

		function loadStatus() {
			return fs.exec('/usr/libexec/ss-easy-status.sh', [], null, 20000).then(function(res) {
				statusBox.textContent = (res && res.stdout) || '';
			}).catch(function() {
				return fs.read('/tmp/ss-easy-status.txt').then(function(t) {
					statusBox.textContent = t || _('读状态失败');
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			});
		}

		var addBtn = E('button', {
			class: 'btn cbi-button-action',
			click: ui.createHandlerFn(this, function() {
				var r = importText(linksBox.value);
				refresh();
				return persist(false).then(function() {
					linksBox.value = '';
					var msg = _('已添加 %d 个节点，点「选用」再点「保存并应用」').format(r.ok);
					if (r.bad.length)
						msg += '；无法解析：' + r.bad.join(' | ');
					if (!r.ok && !r.bad.length)
						msg = _('没有读到 ss:// / vmess:// / vless://');
					ui.addNotification(null, E('p', msg), r.ok ? 'info' : 'warning');
					refresh();
				});
			})
		}, _('添加节点'));

		var applyBtn = E('button', {
			class: 'btn cbi-button-apply',
			click: ui.createHandlerFn(this, function() {
				if (enabledBox.checked && !currentId()) {
					ui.addNotification(null, E('p', _('请先点「选用」选一个节点')), 'warning');
					return;
				}
				statusBox.textContent = _('正在保存并启动代理，请等几秒…不要点右上角「未保存的更改」。');
				return persist(true).then(function() {
					return fs.exec('/usr/libexec/ss-easy-apply.sh', [], null, 120000);
				}).then(function(res) {
					var out = (res && res.stdout) || '';
					if (out)
						statusBox.textContent = out;
					ui.addNotification(null, E('p', _('已交给路由器启动。看下面：ss-redir 或 xray 要在跑，listen-1234 不能是 none。')), 'info');
					return out ? null : loadStatus();
				}).catch(function(err) {
					ui.addNotification(null, E('p', String(err)), 'error');
					return loadStatus();
				});
			})
		}, _('保存并应用'));

		var probeBtn = E('button', {
			class: 'btn',
			click: ui.createHandlerFn(this, function() {
				statusBox.textContent = _('正在测每个节点到路由器的 TCP 延迟…');
				return fs.exec('/usr/libexec/ss-easy-probe.sh', [], null, 60000).then(function(res) {
					var out = (res && (res.stdout || res.stderr)) || '';
					return fs.read('/tmp/ss-easy-probe.txt').catch(function() { return out; }).then(function(fileOut) {
						parseProbe(fileOut || out);
						return fs.read('/tmp/ss-easy-probe.log').catch(function() { return ''; }).then(function(logtxt) {
							statusBox.textContent = (fileOut || out || _('探测没有输出。code=%s').format(res && res.code))
								+ (logtxt ? '\n---- log ----\n' + logtxt : '');
							refresh();
						});
					});
				}).catch(function(err) {
					statusBox.textContent = String(err);
				});
			})
		}, _('测试延迟'));

		refresh();

		return E('div', { class: 'cbi-map', id: PAGE }, [
			E('h2', {}, _('简易代理')),
			E('p', {}, _('版本 %s：点「保存并应用」即可，不要点黄色栏去应用全局更改。延迟是路由器到节点的 TCP。').format(PAGE)),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('开关')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('启用代理')),
					E('div', { class: 'cbi-value-field' }, enabledBox)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('访问模式')),
					E('div', { class: 'cbi-value-field' }, modeBox)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('当前节点')),
					E('div', { class: 'cbi-value-field' }, curLabel)
				])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('添加节点')),
				E('p', {}, _('把 ss://、vmess:// 或 vless:// 贴在下面，自动识别。')),
				linksBox,
				E('div', { style: 'margin-top:8px' }, [addBtn, ' ', applyBtn, ' ', probeBtn])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('节点列表（点选用）')),
				E('table', { class: 'table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, _('协议')),
						E('th', {}, _('名称')),
						E('th', {}, _('地址')),
						E('th', {}, _('端口')),
						E('th', {}, _('延迟')),
						E('th', {}, _('操作'))
					])),
					tableBody
				])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('运行状态（不用再找日志页）')),
				E('p', {}, _('延迟测的是路由器到节点 IP:端口，不是电脑 V2Ray。timeout 说明路由出不去。ss-redir/xray 显示 not-running 就是代理没起来。')),
				statusBox
			])
		]);
	}
});
