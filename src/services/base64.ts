// ============================================================
// Base64 Utilities — safe encoding/decoding for various formats
// ============================================================

export const safeB64Decode = (str: string): string => {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    try {
      const fixedStr = str.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(fixedStr)));
    } catch {
      return '';
    }
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
