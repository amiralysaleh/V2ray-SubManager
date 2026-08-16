// ============================================================
// GeoIP Service — resolve server locations with caching
// ============================================================

import { LocationData } from '../types';

const CACHE_KEY = 'vs_geoip_cache_v2';

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', DE: 'Germany', FR: 'France',
  IT: 'Italy', ES: 'Spain', NL: 'Netherlands', CA: 'Canada',
  AU: 'Australia', JP: 'Japan', KR: 'South Korea', SG: 'Singapore',
  HK: 'Hong Kong', IN: 'India', BR: 'Brazil', RU: 'Russia',
  TR: 'Turkey', AE: 'UAE', SE: 'Sweden', NO: 'Norway', FI: 'Finland',
  PL: 'Poland', UA: 'Ukraine', CH: 'Switzerland', AT: 'Austria',
  BE: 'Belgium', DK: 'Denmark', IE: 'Ireland', PT: 'Portugal',
  CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria',
  HR: 'Croatia', GR: 'Greece', IL: 'Israel', ZA: 'South Africa',
  MX: 'Mexico', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
  TH: 'Thailand', VN: 'Vietnam', MY: 'Malaysia', ID: 'Indonesia',
  PH: 'Philippines', TW: 'Taiwan', CN: 'China', PK: 'Pakistan',
  EG: 'Egypt', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait',
  IR: 'Iran', KZ: 'Kazakhstan', AZ: 'Azerbaijan', AM: 'Armenia',
  GE: 'Georgia', BY: 'Belarus', LT: 'Lithuania', LV: 'Latvia',
  EE: 'Estonia', SK: 'Slovakia', SI: 'Slovenia', LU: 'Luxembourg',
  CY: 'Cyprus', IS: 'Iceland', AL: 'Albania', BA: 'Bosnia',
  ME: 'Montenegro', MK: 'North Macedonia', RS: 'Serbia',
  LI: 'Liechtenstein', MC: 'Monaco', AD: 'Andorra', SM: 'San Marino',
};

const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || typeof countryCode !== 'string') return '';
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return '';
  try {
    const codePoints = code.split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return '';
  }
};

const getCountryName = (code: string): string => {
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] || upper;
};

const isValidHost = (host: string): boolean => {
  if (!host || host.length < 3 || host === 'localhost') return false;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) return false;
  return true;
};

const isIpAddress = (host: string): boolean => /^[\d.]+$|:/.test(host);

const getCache = (): Record<string, LocationData> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const updateCache = (host: string, data: LocationData) => {
  const cache = getCache();
  cache[host] = data;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

export const resolveLocation = async (host: string): Promise<LocationData | null> => {
  if (!isValidHost(host)) return null;

  const cache = getCache();
  if (cache[host]) return cache[host];

  let targetIp = host;

  if (!isIpAddress(host)) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(`https://dns.google/resolve?name=${host}&type=A`, { signal: ctrl.signal });
      const data = await res.json();
      if (data.Answer) {
        const a = data.Answer.find((r: any) => r.type === 1);
        if (a) targetIp = a.data;
      }
    } catch { /* fall through */ }
  }

  if (!isValidHost(targetIp)) return null;

  // Primary: ipwho.is
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://ipwho.is/${targetIp}?lang=en`, { signal: ctrl.signal });
    const data = await res.json();
    if (data.success) {
      const result: LocationData = {
        flag: getFlagEmoji(data.country_code),
        country: data.country || getCountryName(data.country_code),
        city: data.city || '',
      };
      updateCache(host, result);
      return result;
    }
  } catch { /* fall through */ }

  // Fallback: ipapi.co
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`https://ipapi.co/${targetIp}/json/`, { signal: ctrl.signal });
    const data = await res.json();
    if (data.country_code) {
      const result: LocationData = {
        flag: getFlagEmoji(data.country_code),
        country: data.country_name || getCountryName(data.country_code),
        city: data.city || '',
      };
      updateCache(host, result);
      return result;
    }
  } catch { /* fall through */ }

  return null;
};

export const batchResolve = async (hosts: string[]): Promise<Record<string, LocationData>> => {
  const unique = [...new Set(hosts.filter(h => isValidHost(h)))];
  const results: Record<string, LocationData> = {};

  for (let i = 0; i < unique.length; i += 3) {
    const batch = unique.slice(i, i + 3);
    await Promise.all(
      batch.map(async (host) => {
        const r = await resolveLocation(host);
        if (r) results[host] = r;
      })
    );
    if (i + 3 < unique.length) await new Promise(r => setTimeout(r, 500));
  }
  return results;
};
