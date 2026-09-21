'use strict';

const fs = require('fs');
const path = require('path');

if (typeof atob === 'undefined') {
	global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
	global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
	global.escape = function(s) {
		return encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p) => {
			const c = parseInt(p, 16);
			return (c < 128) ? String.fromCharCode(c) : '%' + p;
		});
	};
}

const src = fs.readFileSync(
	path.join(__dirname, '../package/luci-app-shadowsocks-libev/htdocs/luci-static/resources/view/k2p-proxy/index.js'),
	'utf8'
);
const body = src
	.replace(/'use strict';/, '')
	.replace(/'require[^']+';/g, '')
	.replace(/return view\.extend\([\s\S]*$/, '\nmodule.exports = { parseLink, parseSs, parseVmess, splitLinks };\n');

const parse = eval(body + '\n({ parseLink, parseSs, parseVmess, splitLinks })');

function b64url(obj) {
	return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

let failed = 0;
function ok(name, cond, extra) {
	if (!cond) {
		failed++;
		console.error('FAIL', name, extra || '');
	} else {
		console.log('ok', name);
	}
}

const sip = 'ss://' + Buffer.from('chacha20-ietf-poly1305:secret', 'utf8').toString('base64') + '@1.2.3.4:8388#MyBWG2';
let p = parse.parseLink(sip);
ok('sip002 ss', p && p.protocol === 'ss' && p.server === '1.2.3.4' && p.server_port === '8388' && p.password === 'secret' && p.method === 'chacha20-ietf-poly1305');

const sipQ = 'ss://' + Buffer.from('aes-256-gcm:p@ss', 'utf8').toString('base64') + '@example.com:443?plugin=v2ray-plugin%3Bmode%3Dwebsocket#n1';
p = parse.parseLink(sipQ);
ok('sip002 query no slash', p && p.server === 'example.com' && p.plugin === 'v2ray-plugin');

const legacy = 'ss://' + Buffer.from('aes-256-gcm:password@9.9.9.9:6001', 'utf8').toString('base64') + '#legacy';
p = parse.parseLink(legacy);
ok('legacy ss', p && p.server === '9.9.9.9' && p.server_port === '6001' && p.password === 'password');

const rawSs = 'ss://aes-256-gcm:hello@10.0.0.2:9000#raw';
p = parse.parseLink(rawSs);
ok('raw userinfo ss', p && p.server === '10.0.0.2' && p.password === 'hello');

const vm = {
	v: '2',
	ps: '测试节点',
	add: '8.8.8.8',
	port: '443',
	id: '11111111-1111-1111-1111-111111111111',
	aid: '0',
	net: 'ws',
	type: 'none',
	host: 'www.example.com',
	path: '/v2',
	tls: 'tls'
};
p = parse.parseLink('vmess://' + b64url(vm));
ok('v2rayn vmess', p && p.protocol === 'vmess' && p.server === '8.8.8.8' && p.server_port === '443' && p.uuid === vm.id && p.network === 'ws' && p.tls === 'tls' && p.ws_path === '/v2');

p = parse.parseLink('vmess://' + b64url(vm).replace(/=+$/, ''));
ok('vmess no pad', p && p.server === '8.8.8.8');

const share = 'vmess://11111111-1111-1111-1111-111111111111@1.1.1.1:443?encryption=auto&security=tls&type=ws&host=a.com&path=%2F#share';
p = parse.parseLink(share);
ok('vmess share', p && p.server === '1.1.1.1' && p.tls === 'tls' && p.network === 'ws' && p.ws_path === '/');

p = parse.parseLink('vmess://' + JSON.stringify({ add: '2.2.2.2', port: 8080, id: vm.id, ps: 'j' }));
ok('vmess raw json', p && p.server === '2.2.2.2' && p.server_port === '8080');

p = parse.parseLink(JSON.stringify({ add: '3.3.3.3', port: '80', id: vm.id }));
ok('bare json', p && p.server === '3.3.3.3');

p = parse.parseLink('  VMESS://' + b64url(vm) + '  ');
ok('vmess case/space', p && p.server === '8.8.8.8');

const mixed = sip + '\n' + 'vmess://' + b64url(vm);
const parts = parse.splitLinks(mixed);
ok('split 2', parts.length === 2, JSON.stringify(parts.map(function(x) { return x.slice(0, 24); })) + ' n=' + parts.length);

if (failed) {
	console.error(failed + ' failed');
	process.exit(1);
}
console.log('all passed');
