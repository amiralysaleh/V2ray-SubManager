// ============================================================
// V2Ray SubManager — Type Definitions
// ============================================================

export interface ProcessingOptions {
  enableMux: boolean;
  muxConcurrency: number;
  enableFragment: boolean;
  fragmentLength: string;
  fragmentInterval: string;
  allowInsecure: boolean;
  enableALPN: boolean;
  enableCDNIP: boolean;
  customCDN: string;
  // Optional config renaming — OFF by default, keeps original names
  renameConfigs: boolean;
  renameTemplate: string;
  // URL Enhancer (cs/fm/fp injection)
  enableEnhancer: boolean;
  enhancerFp: string;
  enhancerCs: string;
  enhancerFm: string;
}

export interface LogEntry {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: Date;
}

export interface PingResult {
  id: string;
  alias: string;
  host: string;
  protocol: string;
  latency: number | 'timeout' | 'error';
  lastTested: Date;
}

export interface LocationData {
  flag: string;
  country: string;
  city: string;
}

export interface GistFile {
  filename: string;
  content: string;
  raw_url?: string;
}

export interface GistResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
  description: string;
  created_at: string;
  updated_at: string;
}

// Proxy-Builder parsed types
export interface ParsedProxy {
  protocol: string;
  server: string;
  port: number;
  remark: string;
  uuid?: string;
  password?: string;
  method?: string;
  user?: string;
  pass?: string;
  type?: string;
  headerType?: string;
  host?: string;
  path?: string;
  serviceName?: string;
  authority?: string;
  mode?: string;
  security?: string;
  sni?: string;
  fp?: string;
  alpn?: string;
  pbk?: string;
  sid?: string;
  spx?: string;
  flow?: string;
  encryption?: string;
  ech?: string;
  allowInsecure?: boolean;
  aid?: number;
  [key: string]: unknown;
}

export interface EnhancerOptions {
  server: string;
  fp: string;
  cs: string;
  fm: string;
}

export interface AppTab {
  id: 'subscription' | 'enhancer' | 'chain';
  label: string;
  icon: string;
}
