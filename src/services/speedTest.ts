// ============================================================
// Speed Test Service — ping servers to measure latency
// ============================================================

import { safeB64Decode } from './base64';
import { PingResult } from '../types';

interface ServerInfo {
  id: string;
  alias: string;
  host: string;
  protocol: string;
}

export const extractServerInfo = (input: string): ServerInfo[] => {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.map((line, index) => {
    try {
      if (line.startsWith('vmess://')) {
        const data = JSON.parse(safeB64Decode(line.replace('vmess://', '')));
        return { id: `vms-${index}`, alias: data.ps || 'VMess', host: data.add, protocol: 'VMess' };
      }
      if (line.startsWith('vless://') || line.startsWith('trojan://') || line.startsWith('ss://')) {
        const url = new URL(line);
        return {
          id: `url-${index}`,
          alias: decodeURIComponent(url.hash.substring(1)) || url.hostname,
          host: url.hostname,
          protocol: url.protocol.replace(':', '').toUpperCase(),
        };
      }
      if (line.startsWith('ssr://')) {
        const b64 = line.replace('ssr://', '').split('/')[0];
        const decoded = safeB64Decode(b64);
        const host = decoded.split(':')[0];
        return { id: `ssr-${index}`, alias: 'SSR Server', host, protocol: 'SSR' };
      }
    } catch { /* skip */ }
    return null;
  }).filter((s): s is ServerInfo => s !== null && !!s.host);
};

export const pingServer = async (server: ServerInfo): Promise<PingResult> => {
  const start = performance.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 4000);

  try {
    await fetch(`https://${server.host}`, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-cache', referrerPolicy: 'no-referrer' });
    clearTimeout(tid);
    return { ...server, latency: Math.round(performance.now() - start), lastTested: new Date() };
  } catch {
    clearTimeout(tid);
    // Fallback HTTP
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 2000);
      await fetch(`http://${server.host}`, { mode: 'no-cors', signal: c2.signal });
      clearTimeout(t2);
      return { ...server, latency: Math.round(performance.now() - start), lastTested: new Date() };
    } catch {
      return { ...server, latency: 'error', lastTested: new Date() };
    }
  }
};
