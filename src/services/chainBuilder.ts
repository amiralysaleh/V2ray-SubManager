// ============================================================
// Chain Builder — generates Xray & Sing-box JSON from 2 proxy configs
// Merged from Proxy-Builder
// ============================================================

import { ParsedProxy } from '../types';

interface ChainOptions {
  dnsServer: string;
  socksPort: number;
  logLevel: string;
}

const DEFAULT_OPTIONS: ChainOptions = {
  dnsServer: 'https://8.8.8.8/dns-query',
  socksPort: 10808,
  logLevel: 'warning',
};

// ============================================================
// Xray Config Generator
// ============================================================

function buildStreamSettings(params: ParsedProxy, isChain: boolean) {
  const stream: any = { network: params.type || 'tcp', security: params.security || 'none' };
  stream.sockopt = isChain
    ? { domainStrategy: 'UseIPv4', dialerProxy: 'proxy' }
    : { domainStrategy: 'UseIP' };

  switch (stream.network) {
    case 'ws':
      stream.wsSettings = {};
      if (params.host) stream.wsSettings.host = params.host;
      stream.wsSettings.path = params.path || '/';
      break;
    case 'grpc':
      stream.grpcSettings = {};
      if (params.authority) stream.grpcSettings.authority = params.authority;
      if (params.mode) stream.grpcSettings.multiMode = params.mode === 'multi';
      if (params.serviceName) stream.grpcSettings.serviceName = params.serviceName;
      break;
    case 'httpupgrade':
      stream.httpupgradeSettings = { host: params.host || '', path: params.path || '/' };
      break;
    case 'tcp':
    case 'raw':
      if (params.headerType === 'http') {
        stream.rawSettings = {
          header: {
            type: 'http',
            request: { headers: {}, path: params.path ? params.path.split(',') : ['/'], method: 'GET', version: '1.1' },
          },
        };
        if (params.host) stream.rawSettings.header.request.headers.Host = params.host.split(',');
      }
      break;
  }

  if (params.security === 'tls') {
    stream.tlsSettings = {
      serverName: params.sni || params.server,
      fingerprint: params.fp || 'chrome',
      alpn: params.alpn ? params.alpn.split(',') : ['http/1.1'],
      allowInsecure: !!params.allowInsecure,
    };
    if (params.ech) stream.tlsSettings.echConfigList = params.ech;
  } else if (params.security === 'reality') {
    stream.realitySettings = {
      serverName: params.sni || params.server,
      fingerprint: params.fp || 'chrome',
      publicKey: params.pbk || '',
      shortId: params.sid || '',
      spiderX: params.spx || '',
      show: false,
      allowInsecure: !!params.allowInsecure,
    };
  }
  return stream;
}

function buildOutbound(params: ParsedProxy, tag: string) {
  const protos = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http'];
  const proto = protos.includes(params.protocol) ? params.protocol : undefined;
  if (!proto) return null;

  const outbound: any = { protocol: proto, tag };
  const s: any = {};

  switch (proto) {
    case 'vless': {
      const user: any = { id: params.uuid, encryption: params.encryption || 'none' };
      if (params.flow) user.flow = params.flow;
      s.vnext = [{ address: params.server, port: params.port, users: [user] }];
      break;
    }
    case 'vmess':
      s.vnext = [{ address: params.server, port: params.port, users: [{ id: params.uuid, alterId: params.aid || 0, security: 'auto' }] }];
      break;
    case 'trojan':
      s.servers = [{ address: params.server, port: params.port, password: params.password }];
      break;
    case 'shadowsocks':
      s.servers = [{ address: params.server, port: params.port, method: params.method, password: params.password }];
      break;
    case 'socks': {
      const sockServer: any = { address: params.server, port: params.port };
      if (params.user && params.pass) sockServer.users = [{ user: params.user, pass: params.pass }];
      s.servers = [sockServer];
      break;
    }
    case 'http': {
      const httpServer: any = { address: params.server, port: params.port };
      if (params.user && params.pass) httpServer.users = [{ user: params.user, pass: params.pass }];
      s.servers = [httpServer];
      break;
    }
  }
  outbound.settings = s;
  outbound.streamSettings = buildStreamSettings(params, tag === 'chain');
  return outbound;
}

export const generateXrayConfig = (config1: ParsedProxy, config2: ParsedProxy, options?: Partial<ChainOptions>) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (config1.protocol === 'ssh' || config2.protocol === 'ssh') {
    return { error: 'SSH protocol is only supported by Sing-box. Xray config is not available.' };
  }

  const proxy = buildOutbound(config1, 'proxy');
  const chain = buildOutbound(config2, 'chain');
  if (!proxy || !chain) return { error: 'Failed to build outbounds' };

  const remark = `${config1.protocol.toUpperCase()} → ${config2.protocol.toUpperCase()} | ${config2.server}:${config2.port}`;

  return {
    config: {
      remarks: remark,
      log: { loglevel: opts.logLevel },
      dns: {
        servers: [{ address: opts.dnsServer, tag: 'remote-dns' }],
        queryStrategy: 'UseIP',
        tag: 'dns',
      },
      inbounds: [{
        listen: '127.0.0.1', port: opts.socksPort, protocol: 'socks',
        settings: { auth: 'noauth', udp: true },
        tag: 'mixed-in',
        sniffing: { enabled: true, destOverride: ['http', 'tls'] },
      }],
      outbounds: [
        chain, proxy,
        { protocol: 'dns', tag: 'dns-out' },
        { protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP' } },
        { protocol: 'blackhole', tag: 'block' },
      ],
      routing: {
        domainStrategy: 'IPIfNonMatch',
        rules: [
          { inboundTag: ['remote-dns'], outboundTag: 'proxy', type: 'field' },
          { network: 'tcp', outboundTag: 'chain', type: 'field' },
          { protocol: ['dns'], outboundTag: 'dns-out', type: 'field' },
        ],
      },
    },
    remark,
  };
};

// ============================================================
// Sing-box Config Generator
// ============================================================

function buildSingboxOutbound(params: ParsedProxy, tag: string, detourTag: string | null) {
  const outbound: any = { tag, type: params.protocol, server: params.server, server_port: params.port };
  if (detourTag) outbound.detour = detourTag;

  switch (params.protocol) {
    case 'vless':
      outbound.uuid = params.uuid;
      outbound.packet_encoding = '';
      outbound.network = 'tcp';
      if (params.flow) outbound.flow = params.flow;
      break;
    case 'vmess':
      outbound.uuid = params.uuid;
      outbound.security = 'auto';
      outbound.alter_id = params.aid || 0;
      outbound.network = 'tcp';
      break;
    case 'trojan':
      outbound.password = params.password;
      outbound.network = 'tcp';
      break;
    case 'shadowsocks':
      outbound.method = params.method;
      outbound.password = params.password;
      outbound.network = 'tcp';
      break;
    case 'socks':
      outbound.version = '5';
      outbound.network = 'tcp';
      if (params.user) outbound.username = params.user;
      if (params.pass) outbound.password = params.pass;
      break;
    case 'http':
      if (params.user) outbound.username = params.user;
      if (params.pass) outbound.password = params.pass;
      break;
    case 'ssh':
      return { ...outbound, type: 'ssh', user: params.user || 'root', password: params.password };
    default:
      return outbound;
  }

  const security = params.security || 'none';
  if (security === 'tls' || security === 'reality') {
    const tls: any = { enabled: true, server_name: params.sni || params.host || params.server };
    if (params.allowInsecure) tls.insecure = true;
    if (params.alpn) {
      const alpn = params.alpn.split(',').filter(v => v && v !== 'h2');
      if (alpn.length) tls.alpn = alpn;
    }
    if (params.fp) tls.utls = { enabled: true, fingerprint: params.fp };
    if (security === 'reality' && params.pbk) {
      tls.reality = { enabled: true, public_key: params.pbk, short_id: params.sid || '' };
    }
    if (params.ech) {
      const echQueryServer = params.ech.split('+')[0];
      tls.record_fragment = false;
      tls.ech = { enabled: true, query_server_name: echQueryServer || params.sni || params.server };
    }
    outbound.tls = tls;
  }

  const transportType = params.type || 'tcp';
  switch (transportType) {
    case 'ws': {
      const ws: any = { type: 'ws', path: (params.path || '/').split('?ed=')[0], headers: {} };
      if (params.host) ws.headers.Host = params.host;
      const ed = (params.path || '').match(/[?&]ed=(\d+)/);
      if (ed) { ws.max_early_data = parseInt(ed[1]); ws.early_data_header_name = 'Sec-WebSocket-Protocol'; }
      outbound.transport = ws;
      break;
    }
    case 'grpc':
      outbound.transport = { type: 'grpc', service_name: params.serviceName || '' };
      break;
    case 'httpupgrade':
      outbound.transport = { type: 'httpupgrade', host: params.host, path: (params.path || '/').split('?ed=')[0] };
      break;
    case 'tcp':
      if (params.headerType === 'http') {
        outbound.transport = {
          type: 'http', host: params.host ? params.host.split(',') : undefined,
          path: params.path || '/', method: 'GET',
          headers: { Connection: ['keep-alive'], 'Content-Type': ['application/octet-stream'] },
        };
      }
      break;
  }
  return outbound;
}

export const generateSingboxConfig = (config1: ParsedProxy, config2: ParsedProxy, options?: Partial<ChainOptions>) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const remark = `${config1.protocol.toUpperCase()} → ${config2.protocol.toUpperCase()} | ${config2.server}:${config2.port}`;

  const proxy = buildSingboxOutbound(config1, 'proxy', null);
  const chain = buildSingboxOutbound(config2, 'chain', 'proxy');

  const bypassDomains = new Set<string>();
  [config1, config2].forEach(cfg => {
    if (cfg.server && !cfg.server.match(/^(\d{1,3}\.){3}\d{1,3}$/)) bypassDomains.add(cfg.server);
    if (cfg.sni) bypassDomains.add(cfg.sni);
    if (cfg.host) cfg.host.split(',').forEach(h => bypassDomains.add(h.trim()));
    if (cfg.ech) { const d = cfg.ech.split('+')[0]; if (d) bypassDomains.add(d); }
  });

  const sbLogLevel = opts.logLevel === 'none' ? undefined : opts.logLevel === 'warning' ? 'warn' : opts.logLevel;
  let dnsHost = '8.8.8.8', dnsType = 'https';
  try { const u = new URL(opts.dnsServer); dnsHost = u.hostname; dnsType = u.protocol.replace(':', ''); } catch {}

  return {
    config: {
      log: { disabled: opts.logLevel === 'none', level: sbLogLevel, timestamp: true },
      dns: {
        servers: [
          { type: dnsType, server: dnsHost, detour: 'chain', tag: 'dns-remote' },
          { type: 'local', tag: 'dns-direct' },
        ],
        rules: [
          { clash_mode: 'Direct', server: 'dns-direct' },
          { clash_mode: 'Global', server: 'dns-remote' },
          { domain: Array.from(bypassDomains), server: 'dns-direct' },
        ],
        strategy: 'ipv4_only',
        independent_cache: true,
      },
      inbounds: [
        { type: 'tun', tag: 'tun-in', address: ['172.19.0.1/28'], mtu: 9000, auto_route: true, strict_route: true, stack: 'mixed' },
        { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
      ],
      outbounds: [chain, proxy, { type: 'direct', tag: 'direct' }],
      route: {
        rules: [
          { ip_cidr: '172.19.0.2', action: 'hijack-dns' },
          { domain: Array.from(bypassDomains), outbound: 'direct' },
          { clash_mode: 'Direct', outbound: 'direct' },
          { action: 'sniff' },
          { protocol: 'dns', action: 'hijack-dns' },
          { ip_is_private: true, outbound: 'direct' },
          { network: 'udp', action: 'reject' },
        ],
        auto_detect_interface: true,
        default_domain_resolver: { server: 'dns-direct', strategy: 'ipv4_only', rewrite_ttl: 60 },
        final: 'chain',
      },
      ntp: { enabled: true, server: 'time.cloudflare.com', server_port: 123, domain_resolver: 'dns-direct', interval: '30m', write_to_system: false },
      experimental: {
        cache_file: { enabled: true, store_fakeip: true },
        clash_api: { external_controller: '127.0.0.1:9090', external_ui: 'ui', default_mode: 'Rule', external_ui_download_url: 'https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', external_ui_download_detour: 'direct' },
      },
    },
    remark,
  };
};

// ============================================================
// Nekoray Config (Sing-box compatible, client-optimized)
// ============================================================

export const generateNekorayConfig = (config1: ParsedProxy, config2: ParsedProxy, options?: Partial<ChainOptions>) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const remark = `NEKORAY: ${config1.protocol.toUpperCase()} → ${config2.protocol.toUpperCase()} | ${config2.server}:${config2.port}`;

  const hop1 = buildSingboxOutbound(config1, 'hop-1', null);
  if (config1.protocol === 'vless' && !hop1.packet_encoding) hop1.packet_encoding = 'xudp';
  const proxy = buildSingboxOutbound(config2, 'proxy', 'hop-1');
  if (config2.protocol === 'vless' && !proxy.packet_encoding) proxy.packet_encoding = 'xudp';

  const sbLogLevel = opts.logLevel === 'none' ? 'info' : opts.logLevel === 'warning' ? 'warn' : opts.logLevel;

  return {
    config: {
      log: { level: sbLogLevel },
      dns: {
        servers: [
          { address: opts.dnsServer, detour: 'proxy', tag: 'dns-remote' },
          { address: '1.1.1.1', detour: 'direct', tag: 'dns-direct' },
        ],
        rules: [{ outbound: 'any', server: 'dns-direct' }],
      },
      inbounds: [{ listen: '127.0.0.1', listen_port: 2080, sniff: true, tag: 'mixed-in', type: 'mixed' }],
      outbounds: [hop1, proxy, { tag: 'direct', type: 'direct' }, { tag: 'dns-out', type: 'dns' }],
      route: { auto_detect_interface: true, final: 'proxy', rules: [{ outbound: 'dns-out', protocol: 'dns' }] },
    },
    remark,
  };
};

// ============================================================
// Nekobox Config (Android-optimized)
// ============================================================

export const generateNekoboxConfig = (config1: ParsedProxy, config2: ParsedProxy, options?: Partial<ChainOptions>) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const remark = `NEKOBOX: ${config1.protocol.toUpperCase()} → ${config2.protocol.toUpperCase()} | ${config2.server}:${config2.port}`;

  const hop1 = buildSingboxOutbound(config1, 'hop-1', null);
  if (config1.protocol === 'vless' && !hop1.packet_encoding) hop1.packet_encoding = 'xudp';
  const proxy = buildSingboxOutbound(config2, 'proxy', 'hop-1');
  if (config2.protocol === 'vless' && !proxy.packet_encoding) proxy.packet_encoding = 'xudp';

  const sbLogLevel = opts.logLevel === 'none' ? 'info' : opts.logLevel === 'warning' ? 'warn' : opts.logLevel;

  return {
    config: {
      log: { level: sbLogLevel },
      dns: {
        servers: [
          { tag: 'dns-remote', address: opts.dnsServer, detour: 'proxy' },
          { tag: 'dns-direct', address: '1.1.1.1', detour: 'direct' },
        ],
        rules: [{ outbound: 'any', server: 'dns-direct' }],
      },
      inbounds: [{
        type: 'tun', tag: 'tun-in', interface_name: 'tun0', inet4_address: '172.19.0.1/30',
        auto_route: true, strict_route: true, stack: 'system', sniff: true, sniff_override_destination: false,
      }],
      outbounds: [hop1, proxy, { type: 'direct', tag: 'direct' }, { type: 'dns', tag: 'dns-out' }],
      route: { auto_detect_interface: true, final: 'proxy', rules: [{ protocol: 'dns', outbound: 'dns-out' }] },
    },
    remark,
  };
};
