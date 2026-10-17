// ============================================================
// Base64 Utilities — safe encoding/decoding for various formats
// ============================================================

export const safeB64Decode = (str: string): string => {
  if (!str) return '';
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binString = atob(padded);
    const bytes = Uint8Array.from(binString, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
};

export const safeB64Encode = (str: string): string => {
  if (!str) return '';
  try {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, b => String.fromCharCode(b)).join('');
    return btoa(binString);
  } catch {
    return '';
  }
};

export const safeBase64UrlDecode = (str: string): string => {
  return safeB64Decode(str);
};

export const safeBase64UrlEncode = (str: string): string => {
  return safeB64Encode(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};
