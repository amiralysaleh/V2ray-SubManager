// ============================================================
// Subscription Processing Service
// Parses & processes VMess, VLESS, Trojan, Shadowsocks, SSR
// ============================================================

import { ProcessingOptions, LocationData } from '../types';
import { safeB64Decode, safeB64Encode, safeBase64UrlDecode, safeBase64UrlEncode } from './base64';
import { batchResolve } from './geoIp';

// --- Host Extraction ---

const getHostFromVmess = (link: string): string | null => {
  try {
    const json = JSON.parse(safeB64Decode(link.replace('vmess://', '')));
    return json.add?.trim() || null;
  } catch {
    return null;
  }
};

const getHostFromSSR = (link: string): string | null => {
  try {
    const decoded = safeBase64UrlDecode(link.replace(/^ssr:\/\//, '').split('/')[0]);
    return decoded.split(':')[0] || null;
  } catch {
    return null;
  }
};

const getHostFromStandard = (link: string): string | null => {
  try {
    if (link.startsWith('ss://') && !link.includes('@')) {
      const b64 = link.substring(5, link.indexOf('#') > -1 ? link.indexOf('#') : undefined);
      const decoded = safeBase64UrlDecode(b64);
      if (decoded.includes('@')) {
        const hostPart = decoded.split('@')[1];
        return hostPart?.split(':')[0] || null;
      }
    }
    const url = new URL(link);
    let host = url.hostname;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    return host || null;
  } catch {
    return null;
  }
};

const extractHost = (link: string): string | null => {
  link = link.trim();
  if (link.startsWith('vmess://')) return getHostFromVmess(link);
  if (link.startsWith('ssr://')) return getHostFromSSR(link);
  if (link.startsWith('vless://') || link.startsWith('trojan://') || link.startsWith('ss://')) {
    return getHostFromStandard(link);
  }
  return null;
};

// --- Naming ---

const generateAlias = (
  originalAlias: string,
  index: number,
  location: LocationData | undefined,
  options: ProcessingOptions
): string => {
  const parts: string[] = [];
  const base = options.customBaseName?.trim() || 'VS';

  if (location?.country) {
    if (location.flag) parts.push(location.flag);
    parts.push(location.country);
  }
  parts.push(base);
  parts.push(String(index + 1));
  return parts.join(' ');
};

// --- VMess Processing ---

const processVmess = (link: string, opts: ProcessingOptions, index: number, loc: LocationData | undefined): string => {
  try {
    const json = JSON.parse(safeB64Decode(link.replace('vmess://', '')));

    if (opts.enableCDNIP && opts.customCDN && (json.net === 'ws' || json.net === 'grpc')) {
      const original = json.add;
      json.add = opts.customCDN;
      if (!json.host) json.host = original;
      if (json.tls === 'tls' && !json.sni) json.sni = original;
    }
    if (opts.enableMux) json.mux = { enabled: true, concurrency: opts.muxConcurrency || 8 };
    if (opts.enableALPN && json.tls === 'tls') json.alpn = 'h2,http/1.1';
    if (opts.allowInsecure && json.tls === 'tls') {
      json.allowInsecure = 1;
    }

    json.ps = generateAlias(json.ps, index, loc, opts);
    return 'vmess://' + safeB64Encode(JSON.stringify(json));
  } catch {
    return link;
  }
};

// --- SSR Processing ---

const processSSR = (link: string, opts: ProcessingOptions, index: number, loc: LocationData | undefined): string => {
  try {
    const b64 = link.replace(/^ssr:\/\//, '');
    const decoded = safeBase64UrlDecode(b64);
    const [mainPart, paramsStr] = decoded.split('/?');
    if (!mainPart) return link;
    const params = new URLSearchParams(paramsStr || '');
    params.set('remarks', safeBase64UrlEncode(generateAlias('SSR', index, loc, opts)));
    return 'ssr://' + safeBase64UrlEncode(`${mainPart}/?${params.toString()}`);
  } catch {
    return link;
  }
};

// --- URL-based Processing (VLESS/Trojan/SS) ---

const processUrlBased = (link: string, opts: ProcessingOptions, index: number, loc: LocationData | undefined): string => {
  try {
    let urlStr = link;

    // Legacy SS without @
    if (link.startsWith('ss://') && !link.includes('@')) {
      const hashIdx = link.indexOf('#');
      const b64 = link.substring(5, hashIdx > -1 ? hashIdx : undefined);
      const decoded = safeBase64UrlDecode(b64 || '');
      if (decoded?.includes('@')) urlStr = `ss://${decoded}${hashIdx > -1 ? link.substring(hashIdx) : ''}`;
    }

    const url = new URL(urlStr);
    const params = url.searchParams;
    const isWsOrGrpc = params.get('type') === 'ws' || params.get('type') === 'grpc' || !!params.get('serviceName');

    if (opts.enableCDNIP && opts.customCDN && isWsOrGrpc) {
      const original = url.hostname;
      url.hostname = opts.customCDN;
      if (!params.has('host')) params.set('host', original);
      const sec = params.get('security');
      if (!params.has('sni') && (sec === 'tls' || sec === 'reality')) params.set('sni', original);
    }
    if (opts.enableMux) {
      params.set('mux', 'true');
      params.set('concurrency', String(opts.muxConcurrency));
    }
    if (opts.enableFragment) {
      params.set('fragment', `${opts.fragmentLength},${opts.fragmentInterval},random`);
    }
    if (opts.allowInsecure) params.set('allowInsecure', '1');
    if (opts.enableALPN) {
      const sec = params.get('security');
      if (sec === 'tls' || sec === 'reality') params.set('alpn', 'h2,http/1.1');
    }

    url.hash = encodeURIComponent(generateAlias('Config', index, loc, opts));
    return url.toString();
  } catch {
    return link;
  }
};

// --- Parse Subscription (base64 decode) ---

export const parseSubscription = (content: string): string => {
  const decoded = safeB64Decode(content.trim());
  return decoded || content;
};

// --- Main Processor ---

export const processConfigs = async (input: string, options: ProcessingOptions): Promise<string> => {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let hostLocationMap: Record<string, LocationData> = {};
  if (options.addLocationFlag) {
    const hosts = lines.map(extractHost).filter((h): h is string => h !== null);
    if (hosts.length > 0) hostLocationMap = await batchResolve(hosts);
  }

  const processed = lines.map((line, index) => {
    const host = extractHost(line);
    const loc = host && hostLocationMap[host] ? hostLocationMap[host] : undefined;

    if (line.startsWith('vmess://')) return processVmess(line, options, index, loc);
    if (line.startsWith('ssr://')) return processSSR(line, options, index, loc);
    if (line.startsWith('vless://') || line.startsWith('trojan://') || line.startsWith('ss://')) {
      return processUrlBased(line, options, index, loc);
    }
    return line;
  });

  return safeB64Encode(processed.join('\n'));
};

export const getTehranDate = (): string => {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const extractServerInfo = (input: string): { id: string; alias: string; host: string; protocol: string }[] => {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.map((line, i) => {
    try {
      if (line.startsWith('vmess://')) {
        const data = JSON.parse(safeB64Decode(line.replace('vmess://', '')));
        return { id: `vms-${i}`, alias: data.ps || 'VMess', host: data.add, protocol: 'VMess' };
      }
      if (line.startsWith('vless://') || line.startsWith('trojan://') || line.startsWith('ss://')) {
        const url = new URL(line);
        return { id: `url-${i}`, alias: decodeURIComponent(url.hash.slice(1)) || url.hostname, host: url.hostname, protocol: url.protocol.replace(':', '').toUpperCase() };
      }
    } catch { /* skip */ }
    return null;
  }).filter((s): s is NonNullable<typeof s> => s !== null && !!s.host);
};
