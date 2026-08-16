// ============================================================
// Base64 Utilities — safe encoding/decoding for various formats
// ============================================================

export const safeB64Decode = (str: string): string => {
  // Normalize URL-safe chars and padding first — standard subs use
  // plain base64 (+ / =), URL-safe subs use - _ without padding.
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  try {
    // Fast path: plain ASCII (works for standard base64 subs)
    return atob(padded);
  } catch {
    /* fall through */
  }
  try {
    // UTF-8 path (for base64 containing non-ASCII, e.g. Persian remarks)
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return '';
  }
};

export const safeB64Encode = (str: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return '';
  }
};

export const safeBase64UrlDecode = (str: string): string => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return safeB64Decode(base64);
};

export const safeBase64UrlEncode = (str: string): string => {
  return safeB64Encode(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};
