// ============================================================
// URL Enhancer Service — inject cs/fm/fp into VLESS/Trojan URLs
// Merged from Proxy-Builder
// ============================================================

import { EnhancerOptions } from '../types';

export const enhanceURL = (
  raw: string,
  options: EnhancerOptions
): { url: string } | { error: string } => {
  const url = raw.trim();
  if (!url) return { error: 'No URL provided' };
  if (!url.startsWith('vless://') && !url.startsWith('trojan://')) {
    return { error: 'Only VLESS and Trojan URLs are supported' };
  }

  let u: URL;
  try {
    u = new URL(url);
  } catch (e: any) {
    return { error: 'Failed to parse URL: ' + e.message };
  }

  const params = u.searchParams;
  const security = params.get('security') || 'none';

  // Server override
  if (options.server) {
    const host = options.server.includes(':') && !options.server.startsWith('[')
      ? '[' + options.server + ']'
      : options.server;
    try { u.hostname = host; } catch (e: any) { return { error: 'Invalid server: ' + e.message }; }
  }

  // Fingerprint
  if (options.fp && options.fp !== 'none') {
    params.set('fp', options.fp);
  }

  // Cipher suites & fragment mask (only for TLS)
  if (security === 'tls') {
    if (options.cs) params.set('cs', options.cs);
    if (options.fm) params.set('fm', options.fm);
  }

  u.search = u.search.replace(/\+/g, '%20');
  return { url: u.toString() };
};
