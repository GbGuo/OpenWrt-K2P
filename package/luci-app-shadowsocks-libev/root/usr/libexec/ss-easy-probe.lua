#!/usr/bin/lua
-- TCP connect latency for each imported node. Writes /tmp/ss-easy-probe.txt

local function trim(s)
	return (tostring(s or ""):gsub("^%s+", ""):gsub("%s+$", ""))
end

local function sh(cmd)
	local p = io.popen(cmd .. " 2>/dev/null")
	if not p then return "" end
	local o = p:read("*a") or ""
	p:close()
	return o
end

local function uci_get(key)
	return trim(sh("uci -q get " .. key))
end

local function sections(stype)
	local out = {}
	local raw = sh("uci -q show shadowsocks-libev")
	for name in raw:gmatch("shadowsocks%-libev%.([%w_]+)%s*=%s*" .. stype) do
		if name ~= "easy_remote" and name ~= "sss0" and name ~= "easy" then
			out[#out + 1] = name
		end
	end
	return out
end

local function uptime()
	local f = io.open("/proc/uptime")
	if not f then return 0 end
	local line = f:read("*l") or "0"
	f:close()
	return tonumber(line:match("([%d%.]+)")) or 0
end

local function tcp_ms(host, port)
	port = tonumber(port)
	if not host or not port then return nil, "bad" end
	local ok, nixio = pcall(require, "nixio")
	if not ok or not nixio then
		local t1 = uptime()
		os.execute(string.format("uclient-fetch -q -T 2 -O /dev/null http://%s:%s >/dev/null 2>&1", host, port))
		local t2 = uptime()
		return math.floor((t2 - t1) * 1000 + 0.5), "fetch"
	end
	local t1 = uptime()
	local s = nixio.socket("inet", "stream")
	if not s then return nil, "socket" end
	s:setopt("socket", "sndtimeo", 2)
	s:setopt("socket", "rcvtimeo", 2)
	local connected = s:connect(host, port)
	s:close()
	local t2 = uptime()
	local ms = math.floor((t2 - t1) * 1000 + 0.5)
	if not connected then return nil, "timeout" end
	return ms, "tcp"
end

local skip = {
	easy_remote = true, sss0 = true, easy = true, easy_redir = true,
	easy_dns = true, ss_rules = true, hi = true, hj = true
}

local lines = {}
local names = {}
for _, t in ipairs({ "server", "ssnode" }) do
	for _, name in ipairs(sections(t)) do
		if not skip[name] then names[#names + 1] = name end
	end
end

local seen = {}
for _, name in ipairs(names) do
	if not seen[name] then
		seen[name] = true
		local host = uci_get("shadowsocks-libev." .. name .. ".server")
		local port = uci_get("shadowsocks-libev." .. name .. ".server_port")
		local ms, how = tcp_ms(host, port)
		if ms then
			lines[#lines + 1] = string.format("%s=%d", name, ms)
		else
			lines[#lines + 1] = string.format("%s=%s", name, how or "timeout")
		end
	end
end

local text = table.concat(lines, "\n") .. "\n"
local f = io.open("/tmp/ss-easy-probe.txt", "w")
if f then f:write(text) f:close() end
io.write(text)
