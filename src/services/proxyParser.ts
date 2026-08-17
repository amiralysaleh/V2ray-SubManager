// ============================================================
// Proxy URL Parser — parses VLESS, VMess, Trojan, SS, SOCKS, HTTP, SSH
// Merged from Proxy-Builder
// ============================================================

import { ParsedProxy } from '../types';
import { safeBase64UrlDecode } from './base64';

export interface SSHCredentials {
  server: string;
  port: number;
  user: string;
  password: string;
}

export const parseSSH = (creds: SSHCredentials): ParsedProxy | { error: string } | null => {
  const server = creds.server.trim();
  const port = creds.port || 22;
  const user = creds.user.trim() || 'root';
  if (!server) return null;
  if (!creds.password) return { error: 'Password is required for SSH' };
  return {
    protocol: 'ssh',
    server,
    port,
    user,
    password: creds.password,
    remark: `SSH ${server}:${port}`,
  };
};

const safeAtob = (str: string): string | null => {
  try {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const final = pad ? padded + '='.repeat(4 - pad) : padded;
    return decodeURIComponent(atob(final).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch {
    try {
      const padded = str.replace(/-/g, '+').replace(/_/g, '/');
      const pad = padded.length % 4;
      const final = pad ? padded + '='.repeat(4 - pad) : padded;
      return atob(final);
    } catch {
      return null;
    }
  }
};

export const parseProxyURL = (raw: string): ParsedProxy | { error: string } | null => {
  const url = raw.trim();
  if (!url) return null;

  if (url.startsWith('vless://')) return parseVless(url);
  if (url.startsWith('vmess://')) return parseVmess(url);
  if (url.startsWith('trojan://')) return parseTrojan(url);
  if (url.startsWith('ss://')) return parseShadowsocks(url);
  if (url.startsWith('socks://') || url.startsWith('socks5://')) return parseSocks(url);
  if (url.startsWith('http://') || url.startsWith('https://')) return parseHttp(url);

  try {
    const decoded = safeAtob(url);
    if (decoded && decoded.includes('"add"')) return parseVmess('vmess://' + url);
  } catch { /* ignore */ }

  return { error: 'Unknown protocol. Supported: vless, vmess, trojan, ss, socks, http' };
};

function parseVless(url: string): ParsedProxy {
  const u = new URL(url);
  const p = Object.fromEntries(u.searchParams);
  return {
    protocol: 'vless',
    uuid: u.username || decodeURIComponent(url.split('://')[1].split('@')[0]),
    server: u.hostname,
    port: parseInt(u.port) || 443,
    remark: decodeURIComponent(u.hash.slice(1) || ''),
    type: p.type || 'tcp',
    headerType: p.headerType || 'none',
    host: p.host,
    path: p.path,
    serviceName: p.serviceName,
    authority: p.authority,
    mode: p.mode,
    security: p.security || 'none',
    sni: p.sni,
    fp: p.fp || 'chrome',
    alpn: p.alpn,
    pbk: p.pbk,
    sid: p.sid,
    spx: p.spx,
    flow: p.flow,
    encryption: p.encryption || 'none',
    ech: p.ech,
    allowInsecure: p.allowInsecure === '1' || p.insecure === '1',
  };
}

function parseVmess(url: string): ParsedProxy {
  const b64 = url.replace('vmess://', '');
  const decoded = safeAtob(b64);
  if (!decoded) return { error: 'Failed to decode VMess base64' } as any;
  const c = JSON.parse(decoded);
  return {
    protocol: 'vmess',
    uuid: c.id,
    server: c.add,
    port: parseInt(c.port) || 443,
    aid: parseInt(c.aid) || 0,
    remark: c.ps || '',
    type: c.net || 'tcp',
    headerType: c.type || 'none',
    host: c.host,
    path: c.path,
    security: c.tls || 'none',
    sni: c.sni,
    fp: c.fp || 'chrome',
    alpn: c.alpn,
    allowInsecure: c.tls === 'tls' && (c.allowInsecure === 1 || c.insecure === 1),
  };
}

function parseTrojan(url: string): ParsedProxy {
  const u = new URL(url);
  const p = Object.fromEntries(u.searchParams);
  return {
    protocol: 'trojan',
    password: decodeURIComponent(u.username || url.split('://')[1].split('@')[0]),
    server: u.hostname,
    port: parseInt(u.port) || 443,
    remark: decodeURIComponent(u.hash.slice(1) || ''),
    type: p.type || 'tcp',
    headerType: p.headerType || 'none',
    host: p.host,
    path: p.path,
    serviceName: p.serviceName,
    authority: p.authority,
    mode: p.mode,
    security: p.security || 'tls',
    sni: p.sni,
    fp: p.fp || 'chrome',
    alpn: p.alpn,
    pbk: p.pbk,
    sid: p.sid,
    spx: p.spx,
    ech: p.ech,
    allowInsecure: p.allowInsecure === '1' || p.insecure === '1',
  };
}

function parseShadowsocks(url: string): ParsedProxy {
  let raw = url.replace('ss://', '');
  const hashIdx = raw.indexOf('#');
  let remark = '';
  if (hashIdx !== -1) {
    remark = decodeURIComponent(raw.slice(hashIdx + 1));
    raw = raw.slice(0, hashIdx);
  }
  let method, password, server, port;
  if (raw.includes('@')) {
    const [userPart, hostPart] = raw.split('@');
    const decoded = safeAtob(userPart) || userPart;
    const ci = decoded.indexOf(':');
    method = decoded.slice(0, ci);
    password = decoded.slice(ci + 1);
    const hm = hostPart.match(/^(.+):(\d+)/);
    if (hm) { server = hm[1]; port = parseInt(hm[2]); }
  } else {
    const decoded = safeAtob(raw);
    if (!decoded) return { error: 'Failed to decode SS base64' } as any;
    const m = decoded.match(/^(.+?):(.+)@(.+):(\d+)/);
    if (m) { method = m[1]; password = m[2]; server = m[3]; port = parseInt(m[4]); }
  }
  if (!server) return { error: 'Failed to parse SS URL' } as any;
  return { protocol: 'shadowsocks', method, password, server, port: port as number, remark };
}

function parseSocks(url: string): ParsedProxy {
  const u = new URL(url.replace('socks5://', 'socks://').replace('socks://', 'http://'));
  let user, pass;
  if (u.username) {
    const d = safeAtob(u.username);
    if (d?.includes(':')) { [user, pass] = d.split(':'); }
    else if (d) { user = d; pass = u.password ? (safeAtob(u.password) || u.password) : undefined; }
    else { user = decodeURIComponent(u.username); pass = u.password ? decodeURIComponent(u.password) : undefined; }
  }
  return { protocol: 'socks', server: u.hostname, port: parseInt(u.port) || 1080, user, pass, remark: decodeURIComponent(u.hash.slice(1) || '') };
}

function parseHttp(url: string): ParsedProxy {
  const u = new URL(url);
  let user, pass;
  if (u.username) {
    const d = safeAtob(u.username);
    if (d?.includes(':')) { [user, pass] = d.split(':'); }
    else if (d) { user = d; pass = u.password ? (safeAtob(u.password) || u.password) : undefined; }
    else { user = decodeURIComponent(u.username); pass = u.password ? decodeURIComponent(u.password) : undefined; }
  }
  return { protocol: 'http', server: u.hostname, port: parseInt(u.port) || 80, user, pass, remark: decodeURIComponent(u.hash.slice(1) || '') };
}
