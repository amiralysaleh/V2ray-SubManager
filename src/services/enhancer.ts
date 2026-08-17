// ============================================================
// URL Enhancer Service — inject cs/fm/fp into VLESS/Trojan URLs
// Merged from Proxy-Builder
// ============================================================

import { EnhancerOptions } from '../types';

// Default values identical to the original Proxy-Builder project —
// applied to every eligible config unless the user edits them.
export const DEFAULT_CS =
  'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:' +
  'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256:TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA:TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA:' +
  'TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256:TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256';

export const DEFAULT_FM =
  '{"tcp": [{"type": "fragment", "settings": {"packets": "tlshello", "lengths": ["5", "94", "1"], "delays": ["0"], "maxSplit": "0"}},' +
  '{"type": "fragment", "settings": {"packets": "1-1", "lengths": ["109", "1"], "delays": ["1"], "maxSplit": "355"}}]}';

// Classify cs/fm: "" (explicit clear) → skip, undefined → use default
export const resolveEnhancerValue = (val: string | undefined, fallback: string): string => {
  if (val === undefined) return fallback;
  return val;
};

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

  // Fingerprint — applied when selected value is non-empty
  if (options.fp && options.fp !== 'none') {
    params.set('fp', options.fp);
  }

  // Cipher suites & fragment mask — always applied with defaults for TLS,
  // only skipped when the user explicitly cleared the field ("")
  if (security === 'tls') {
    const cs = resolveEnhancerValue(options.cs, DEFAULT_CS);
    if (cs) params.set('cs', cs);
    const fm = resolveEnhancerValue(options.fm, DEFAULT_FM);
    if (fm) params.set('fm', fm);
  }

  u.search = u.search.replace(/\+/g, '%20');
  return { url: u.toString() };
};
