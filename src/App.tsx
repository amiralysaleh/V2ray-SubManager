import React, { useState, useEffect, useCallback } from 'react';
import { processConfigs, getTehranDate, parseSubscription, extractServerInfo } from './services/subscription';
import { createOrUpdateGist } from './services/github';
import { enhanceURL, DEFAULT_CS, DEFAULT_FM } from './services/enhancer';
import {
  generateXrayConfig,
  generateSingboxConfig,
  generateNekorayConfig,
  generateNekoboxConfig,
} from './services/chainBuilder';
import { parseProxyURL, parseSSH } from './services/proxyParser';
import { pingServer } from './services/speedTest';
import Toggle from './components/Toggle';
import LogPanel from './components/LogPanel';
import OutputPanel from './components/OutputPanel';
import { ProcessingOptions, LogEntry, PingResult, EnhancerOptions, ParsedProxy, AppTab } from './types';

const TABS: AppTab[] = [
  { id: 'subscription', label: 'Subscription Manager', icon: '⊞' },
  { id: 'enhancer', label: 'URL Enhancer', icon: '✦' },
  { id: 'chain', label: 'Chain Builder', icon: '⛓' },
];

export default function App() {
  const githubToken = (import.meta as any).env?.VITE_GITHUB_TOKEN || '';

  // === Tab State ===
  const [activeTab, setActiveTab] = useState<AppTab['id']>('subscription');

  // === Subscription Tab State ===
  const [inputConfigs, setInputConfigs] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [filename, setFilename] = useState('sub.txt');
  const [gistId, setGistId] = useState('');
  const [showGistInput, setShowGistInput] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [outputFormat, setOutputFormat] = useState<'base64' | 'plain'>('plain');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState<ProcessingOptions>({
    enableMux: false, muxConcurrency: 8,
    enableFragment: false, fragmentLength: '10-20', fragmentInterval: '10-20',
    allowInsecure: false, enableALPN: false,
    addLocationFlag: true, enableCDNIP: false, customCDN: '', customBaseName: '',
    enableEnhancer: false, enhancerFp: 'chrome', enhancerCs: DEFAULT_CS, enhancerFm: DEFAULT_FM,
  });

  // === Enhancer Tab State ===
  const [enhancerInput, setEnhancerInput] = useState('');
  const [enhancerResult, setEnhancerResult] = useState('');
  const [enhancerRemark, setEnhancerRemark] = useState('');
  const [enhancerOptions, setEnhancerOptions] = useState<EnhancerOptions>({
    server: '', fp: 'chrome', cs: DEFAULT_CS, fm: DEFAULT_FM,
  });
  const [enhancerParsed, setEnhancerParsed] = useState<ParsedProxy | null>(null);

  // === Chain Builder Tab State ===
  const [chainInput1, setChainInput1] = useState('');
  const [chainInput2, setChainInput2] = useState('');
  const [chainParsed1, setChainParsed1] = useState<ParsedProxy | null>(null);
  const [chainParsed2, setChainParsed2] = useState<ParsedProxy | null>(null);
  const [sshMode1, setSshMode1] = useState(false);
  const [sshMode2, setSshMode2] = useState(false);
  const [sshCreds1, setSshCreds1] = useState({ server: '', port: 22, user: 'root', password: '' });
  const [sshCreds2, setSshCreds2] = useState({ server: '', port: 22, user: 'root', password: '' });
  const [chainDns, setChainDns] = useState('https://8.8.8.8/dns-query');
  const [chainSocksPort, setChainSocksPort] = useState(10808);
  const [chainLogLevel, setChainLogLevel] = useState('warning');
  const [chainXrayResult, setChainXrayResult] = useState('');
  const [chainSingboxResult, setChainSingboxResult] = useState('');
  const [chainNekorayResult, setChainNekorayResult] = useState('');
  const [chainNekoboxResult, setChainNekoboxResult] = useState('');
  const [chainRemark, setChainRemark] = useState('');

  // === Ping/Test State ===
  const [pingResults, setPingResults] = useState<PingResult[]>([]);
  const [pinging, setPinging] = useState(false);

  // ============================================
  // Logging
  // ============================================
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [{ type, message, timestamp: new Date() }, ...prev]);
  }, []);

  // ============================================
  // Gist ID extraction from URL
  // ============================================
  const extractGistId = (url: string): string | null => {
    const m = url.match(/(?:gist\.github(?:usercontent)?\.com)(?:\/[^/]+)?\/([0-9a-f]{32})/i);
    return m?.[1] || null;
  };

  const extractFilename = (url: string): string => {
    try {
      const clean = url.split('?')[0].split('#')[0];
      const name = clean.split('/').pop();
      if (name?.includes('.')) return name;
    } catch {}
    return 'sub.txt';
  };

  useEffect(() => {
    if (!importUrl.trim()) return;
    const id = extractGistId(importUrl);
    if (id) setGistId(id);
  }, [importUrl]);

  // ============================================
  // Subscription: Import
  // ============================================
  const handleImport = async () => {
    if (!importUrl) return;
    setLoading(true);
    addLog('info', 'Fetching subscription from URL...');
    try {
      const id = extractGistId(importUrl);
      if (id) setGistId(id);
      const detected = extractFilename(importUrl);
      setFilename(detected);

      // Some subscription servers (e.g. workers.dev) don't send CORS headers,
      // so route the fetch through a public CORS proxy when a direct fetch fails.
      let text: string;
      const directUrl = `${importUrl}${importUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      try {
        const res = await fetch(directUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch {
        addLog('info', 'Direct fetch blocked by CORS — retrying via proxy...');
        const proxied = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`);
        if (!proxied.ok) throw new Error(`HTTP ${proxied.status}`);
        text = await proxied.text();
      }

      if (text.trim().startsWith('{') && text.includes('outbounds')) {
        addLog('warning', 'JSON config detected. Only standard subscription links are supported.');
      } else {
        const decoded = parseSubscription(text);
        setInputConfigs(decoded);
        addLog('success', `Configs loaded. (Target file: ${detected})`);
      }
      if (id) addLog('info', `Gist detected (ID: ${id.substring(0, 6)}...)`);
    } catch (e: any) {
      addLog('error', `Import error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Subscription: Publish
  // ============================================
  const handlePublish = async (isUpdate: boolean) => {
    if (!githubToken) { addLog('error', 'GitHub token not configured.'); return; }
    if (!inputConfigs.trim()) { addLog('error', 'No configs to publish.'); return; }
    if (isUpdate && !gistId.trim()) {
      addLog('error', 'Gist ID required for update.');
      setShowGistInput(true);
      return;
    }

    setLoading(true);
    const action = isUpdate ? 'UPDATE' : 'CREATE';
    addLog('info', `${action} Gist...`);
    if (options.addLocationFlag) addLog('info', 'Resolving server locations...');

    try {
      const result = await processConfigs(inputConfigs, options);
      if (options.enableEnhancer && result.enhancedCount > 0) {
        addLog('success', `⭐ F+F applied to ${result.enhancedCount} config(s)`);
      }
      // Output format: base64 (default, client-compatible) or plain (readable)
      const outputContent = outputFormat === 'base64' ? result.base64 : result.plain;
      const count = result.plain.split('\n').filter(l => l.trim()).length;
      const time = getTehranDate();
      const desc = `V2Ray Sub | ${count} servers | ${time}`;

      addLog('info', 'Publishing to GitHub...');
      const res = await createOrUpdateGist(githubToken, filename, outputContent, desc, isUpdate ? gistId : undefined);

      if (res.files[filename]?.raw_url) {
        const permUrl = res.files[filename].raw_url.replace(/\/raw\/[a-z0-9]+\//i, '/raw/');
        setResultUrl(permUrl);
        if (!isUpdate) setGistId(res.id);
        addLog('success', isUpdate ? 'Subscription updated successfully.' : 'New subscription created.');
        if (isUpdate) addLog('info', 'Note: CDN caching may take up to 5 minutes.');
      }
    } catch (e: any) {
      addLog('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Subscription: Ping Test
  // ============================================
  const handlePingAll = async () => {
    if (!inputConfigs.trim()) return;
    setPinging(true);
    setPingResults([]);
    addLog('info', 'Pinging servers...');
    try {
      const servers = extractServerInfo(inputConfigs);
      const results: PingResult[] = [];
      for (const s of servers) {
        const r = await pingServer(s);
        results.push(r);
        setPingResults([...results]);
        addLog(r.latency === 'error' || r.latency === 'timeout'
          ? 'warning'
          : 'info',
          `${r.alias}: ${r.latency === 'timeout' ? 'timeout' : r.latency === 'error' ? 'error' : r.latency + 'ms'}`
        );
      }
      addLog('success', `Ping test complete: ${results.filter(r => typeof r.latency === 'number').length}/${results.length} online`);
    } catch (e: any) {
      addLog('error', `Ping error: ${e.message}`);
    } finally {
      setPinging(false);
    }
  };

  // ============================================
  // Enhancer
  // ============================================
  const onEnhancerInputChange = (val: string) => {
    setEnhancerInput(val);
    if (!val.trim()) { setEnhancerParsed(null); return; }
    const parsed = parseProxyURL(val);
    if (parsed && !('error' in parsed) && (parsed.protocol === 'vless' || parsed.protocol === 'trojan')) {
      setEnhancerParsed(parsed);
      if (!enhancerOptions.server || enhancerOptions.server === enhancerParsed?.server) {
        setEnhancerOptions(prev => ({ ...prev, server: parsed.server }));
      }
    } else {
      setEnhancerParsed(null);
    }
  };

  const handleEnhance = () => {
    const result = enhanceURL(enhancerInput, enhancerOptions);
    if ('error' in result) {
      addLog('error', result.error);
      return;
    }
    setEnhancerResult(result.url);
    const p = enhancerParsed;
    setEnhancerRemark(p ? `${p.protocol.toUpperCase()} ${p.server}:${p.port} | enhanced` : 'Enhanced');
    addLog('success', 'URL enhanced successfully.');
  };

  // ============================================
  // Chain Builder
  // ============================================
  const onChainInputChange = (num: 1 | 2, val: string) => {
    if (num === 1) setChainInput1(val);
    else setChainInput2(val);
    reparseChain(num);
  };

  const reparseChain = (num: 1 | 2, forceSSH?: boolean) => {
    const useSSH = forceSSH !== undefined ? forceSSH : (num === 1 ? sshMode1 : sshMode2);
    let parsed: ParsedProxy | { error: string } | null = null;
    if (useSSH) {
      parsed = num === 1 ? parseSSH(sshCreds1) : parseSSH(sshCreds2);
    } else {
      const val = num === 1 ? chainInput1 : chainInput2;
      parsed = val.trim() ? parseProxyURL(val) : null;
    }
    if (num === 1) setChainParsed1(parsed && !('error' in parsed) ? parsed : null);
    else setChainParsed2(parsed && !('error' in parsed) ? parsed : null);
  };

  const toggleSSHMode = (num: 1 | 2) => {
    if (num === 1) setSshMode1(!sshMode1);
    else setSshMode2(!sshMode2);
    reparseChain(num, num === 1 ? !sshMode1 : !sshMode2);
  };

  const handleChainBuild = () => {
    if (!chainParsed1 || !chainParsed2) { addLog('error', 'Both configs required.'); return; }
    const opts = { dnsServer: chainDns, socksPort: chainSocksPort, logLevel: chainLogLevel };
    const hasSSH = chainParsed1.protocol === 'ssh' || chainParsed2.protocol === 'ssh';

    // Xray is not available when SSH is involved (like Proxy-Builder)
    if (hasSSH) {
      setChainXrayResult('');
      addLog('warning', 'SSH is only supported by Sing-box. Xray config skipped.');
    } else {
      const xr = generateXrayConfig(chainParsed1, chainParsed2, opts);
      if ('error' in xr) {
        setChainXrayResult('');
      } else {
        setChainXrayResult(JSON.stringify(xr.config, null, 2));
        setChainRemark(xr.remark);
      }
    }

    const sb = generateSingboxConfig(chainParsed1, chainParsed2, opts);
    setChainSingboxResult(JSON.stringify(sb.config, null, 2));

    const nr = generateNekorayConfig(chainParsed1, chainParsed2, opts);
    setChainNekorayResult(JSON.stringify(nr.config, null, 2));

    const nb = generateNekoboxConfig(chainParsed1, chainParsed2, opts);
    setChainNekoboxResult(JSON.stringify(nb.config, null, 2));

    addLog('success', 'Chain configs generated.');
  };

  // ============================================
  // Copy helpers
  // ============================================
  const copyToClipboard = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      addLog('success', `${label} to clipboard.`);
    } catch { addLog('error', 'Failed to copy.'); }
  };

  const downloadJson = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans antialiased">
      {/* ===== Top Navigation ===== */}
      <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Brand */}
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-violet-950/50">
                VS
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-neutral-100 leading-tight">
                  V2Ray <span className="text-violet-400">SubManager</span>
                </h1>
                <p className="text-[10px] text-neutral-500 leading-tight">Subscription & Proxy Tools</p>
              </div>
            </div>
            {!githubToken && activeTab === 'subscription' && (
              <div className="text-[10px] text-red-400 border border-red-900/50 rounded px-2 py-1 bg-red-950/30">
                TOKEN MISSING
              </div>
            )}
          </div>
          {/* Tabs */}
          <nav className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ================================================================ */}
        {/* TAB 1: SUBSCRIPTION MANAGER */}
        {/* ================================================================ */}
        {activeTab === 'subscription' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar: Options */}
            <div className="lg:col-span-1 space-y-4">
              <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4">
                <h2 className="text-sm font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                  <span className="text-violet-400">⚙</span> Processing Options
                </h2>
                <div className="space-y-1 divide-y divide-neutral-800/50">
                  {/* Naming */}
                  <div className="py-2">
                    <div className="text-xs font-medium text-neutral-400 mb-2">Config Naming</div>
                    <Toggle label="Auto Geo-Rename" description="Format: Flag + Country + Name + #N" checked={options.addLocationFlag} onChange={v => setOptions({...options, addLocationFlag: v})} />
                    <div className="mt-2">
                      <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Custom Base Name</label>
                      <input type="text" placeholder="Default: VS" value={options.customBaseName}
                        onChange={e => setOptions({...options, customBaseName: e.target.value})}
                        className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600 placeholder:text-neutral-700" />
                    </div>
                  </div>

                  {/* CDN IP */}
                  <div className="py-2">
                    <Toggle label="Custom Cloudflare IP" description="Replace server IP (WS/gRPC)" checked={options.enableCDNIP} onChange={v => setOptions({...options, enableCDNIP: v})} />
                    {options.enableCDNIP && (
                      <input type="text" placeholder="e.g. 104.16.x.x" value={options.customCDN}
                        onChange={e => setOptions({...options, customCDN: e.target.value})}
                        className="mt-2 w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600" />
                    )}
                  </div>

                  {/* Mux */}
                  <div className="py-2">
                    <Toggle label="Multiplexing (Mux)" description="Connection multiplexing" checked={options.enableMux} onChange={v => setOptions({...options, enableMux: v})} />
                    {options.enableMux && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-neutral-600 uppercase">Concurrency:</span>
                        <input type="number" min="1" max="1024" value={options.muxConcurrency}
                          onChange={e => setOptions({...options, muxConcurrency: parseInt(e.target.value) || 8})}
                          className="w-16 bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600" />
                      </div>
                    )}
                  </div>

                  {/* Fragment */}
                  <div className="py-2">
                    <Toggle label="Packet Fragment" description="DPI bypass via fragmentation" checked={options.enableFragment} onChange={v => setOptions({...options, enableFragment: v})} />
                    {options.enableFragment && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-600 uppercase w-14">Length:</span>
                          <input type="text" placeholder="10-20" value={options.fragmentLength}
                            onChange={e => setOptions({...options, fragmentLength: e.target.value})}
                            className="flex-1 bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-600 uppercase w-14">Interval:</span>
                          <input type="text" placeholder="10-20" value={options.fragmentInterval}
                            onChange={e => setOptions({...options, fragmentInterval: e.target.value})}
                            className="flex-1 bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600" />
                        </div>
                      </div>
                    )}
                  </div>

                  <Toggle label="Allow Insecure" description="Skip TLS verification" checked={options.allowInsecure} onChange={v => setOptions({...options, allowInsecure: v})} />
                  <Toggle label="Optimize ALPN" description="Force h2,http/1.1 (TLS only)" checked={options.enableALPN} onChange={v => setOptions({...options, enableALPN: v})} />

                  {/* F+F (Patterniha) bulk enhancer */}
                  <div className="py-2">
                    <Toggle label="F+F (Patterniha)" description="Bulk-inject fp / cs / fm into TLS configs ⭐" checked={options.enableEnhancer} onChange={v => setOptions({...options, enableEnhancer: v})} />
                    {options.enableEnhancer && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Fingerprint (fp)</label>
                          <select value={options.enhancerFp} onChange={e => setOptions({...options, enhancerFp: e.target.value})}
                            className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 outline-none focus:border-violet-500">
                            <option value="chrome">chrome</option>
                            <option value="firefox">firefox</option>
                            <option value="safari">safari</option>
                            <option value="random">random</option>
                            <option value="unsafe">unsafe</option>
                            <option value="none">none</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Cipher Suites (cs) — empty to skip</label>
                          <textarea value={options.enhancerCs} onChange={e => setOptions({...options, enhancerCs: e.target.value})}
                            placeholder="Defaults from Patterniha (clear to skip)"
                            className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-[10px] text-neutral-300 font-mono outline-none focus:border-violet-500 resize-none h-12 placeholder:text-neutral-700" />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Fragment Mask (fm) — empty to skip</label>
                          <textarea value={options.enhancerFm} onChange={e => setOptions({...options, enhancerFm: e.target.value})}
                            placeholder='Defaults from Patterniha (clear to skip)'
                            className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-[10px] text-neutral-300 font-mono outline-none focus:border-violet-500 resize-none h-14 placeholder:text-neutral-700" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-2 space-y-4">
              {/* Import + Editor */}
              <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                    <span className="text-violet-400">⌨</span> Config Editor
                  </h2>
                  <div className="flex items-center gap-2">
                    {showGistInput ? (
                      <div className="flex items-center gap-1 bg-neutral-950/80 border border-neutral-700 rounded px-2 py-1">
                        <span className="text-[10px] text-neutral-500">Gist ID:</span>
                        <input type="text" placeholder="Paste Gist ID..." value={gistId}
                          onChange={e => setGistId(e.target.value.trim())}
                          className="bg-transparent text-[11px] font-mono text-neutral-300 placeholder:text-neutral-700 w-28 outline-none" />
                        <button onClick={() => setShowGistInput(false)} className="text-neutral-600 hover:text-neutral-400 text-[10px]">Auto</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowGistInput(true)}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-neutral-500 border border-neutral-800 rounded hover:border-neutral-700 transition-colors">
                        <span className={`w-1.5 h-1.5 rounded-full ${gistId ? 'bg-neutral-200' : 'bg-neutral-700'}`} />
                        {gistId ? `ID: ${gistId.substring(0, 6)}...` : 'Gist: Auto'}
                      </button>
                    )}
                    <span className="text-[10px] text-neutral-600 font-mono">
                      {inputConfigs.split('\n').filter(l => l.trim()).length} configs
                      {/* Show orig count when content is base64-encoded */}
                    </span>
                  </div>
                </div>

                {/* Import URL */}
                <div className="flex gap-2 mb-3 p-1.5 bg-neutral-950/80 border border-neutral-800 rounded focus-within:border-neutral-600 transition-colors">
                  <input type="text" placeholder="Import subscription URL..." value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    className="flex-1 bg-transparent rounded px-3 py-1.5 text-xs text-neutral-300 outline-none font-mono placeholder:text-neutral-700" />
                  <button onClick={handleImport} disabled={loading || !importUrl}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-30">
                    Import
                  </button>
                </div>

                {/* Textarea */}
                <textarea value={inputConfigs}
                  onChange={e => setInputConfigs(e.target.value)}
                  placeholder="Paste VMess, VLESS, Trojan, Shadowsocks, SSR links here..."
                  className="w-full min-h-[240px] bg-neutral-950/50 border border-neutral-800 rounded-lg p-4 font-mono text-xs text-neutral-300 focus:ring-1 focus:ring-neutral-600 outline-none resize-y placeholder:text-neutral-700"
                />

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Output format selector */}
                    <div className="flex items-center gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
                      <button onClick={() => setOutputFormat('base64')}
                        className={`px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                          outputFormat === 'base64' ? 'bg-violet-600 text-white' : 'text-neutral-500 hover:text-neutral-300'
                        }`}>
                        Base64
                      </button>
                      <button onClick={() => setOutputFormat('plain')}
                        className={`px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                          outputFormat === 'plain' ? 'bg-violet-600 text-white' : 'text-neutral-500 hover:text-neutral-300'
                        }`}>
                        Plain
                      </button>
                    </div>
                    <button onClick={() => handlePublish(false)} disabled={loading || !githubToken || !inputConfigs.trim()}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-30 shadow-lg shadow-violet-950/30">
                      + Create New
                    </button>
                    <button onClick={() => handlePublish(true)} disabled={loading || !githubToken || !inputConfigs.trim() || !gistId}
                      className="px-4 py-2 border border-neutral-700 text-neutral-300 text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-30">
                      Update Existing
                    </button>
                  </div>
                  <button onClick={handlePingAll} disabled={pinging || !inputConfigs.trim()}
                    className="px-4 py-2 border border-neutral-800 text-neutral-500 text-xs rounded-lg hover:border-neutral-700 hover:text-neutral-300 transition-colors disabled:opacity-30">
                    {pinging ? 'Pinging...' : 'Ping Test'}
                  </button>
                </div>

                {/* Result URL */}
                {resultUrl && (
                  <div className="mt-4 p-3 border border-neutral-700 rounded-lg bg-neutral-950/50">
                    <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">Subscription URL</label>
                    <div className="flex gap-2">
                      <input readOnly value={resultUrl} className="flex-1 bg-neutral-950 border border-neutral-800 rounded py-2 px-3 text-xs text-neutral-300 font-mono outline-none" />
                      <button onClick={() => copyToClipboard(resultUrl, 'URL copied')}
                        className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded transition-colors">
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ping Results */}
              {pingResults.length > 0 && (
                <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4 animate-fadeIn">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Ping Results</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {pingResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-neutral-800/50">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-500">{r.alias}</span>
                          <span className="text-[10px] text-neutral-600 font-mono">{r.host}</span>
                        </div>
                        <span className={`font-mono ${
                          r.latency === 'error' ? 'text-red-400' :
                          r.latency === 'timeout' ? 'text-yellow-400' :
                          r.latency < 300 ? 'text-neutral-300' :
                          r.latency < 500 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {typeof r.latency === 'number' ? `${r.latency}ms` : r.latency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs */}
              <LogPanel logs={logs} />
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: URL ENHANCER */}
        {/* ================================================================ */}
        {activeTab === 'enhancer' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4">
              <h2 className="text-sm font-semibold text-neutral-200 mb-1 flex items-center gap-2">
                <span className="text-violet-400">✦</span> Fragment + Fingerprint Enhancer
              </h2>
              <p className="text-xs text-neutral-500 mb-4">
                Injects cs (cipher suites), fm (fragment mask), and fp (fingerprint) into VLESS / Trojan URLs
              </p>

              {/* Input */}
              <div className="relative mb-4">
                <textarea value={enhancerInput}
                  onChange={e => onEnhancerInputChange(e.target.value)}
                  placeholder="Paste VLESS or Trojan URL here..."
                  className="w-full min-h-[80px] bg-neutral-950/50 border border-neutral-800 rounded-lg p-4 font-mono text-xs text-neutral-300 focus:ring-1 focus:ring-neutral-600 outline-none resize-y placeholder:text-neutral-700" />
                {enhancerInput && (
                  <button onClick={() => { setEnhancerInput(''); setEnhancerParsed(null); setEnhancerResult(''); }}
                    className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-[10px] text-neutral-600 hover:text-neutral-400 bg-neutral-900 rounded-full border border-neutral-800">
                    ✕
                  </button>
                )}
              </div>

              {/* Parsed info */}
              {enhancerParsed && (
                <div className="mb-4 p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg text-xs space-y-1">
                  <div className="flex gap-2"><span className="text-neutral-500 w-16">Protocol</span><span className="text-neutral-200 font-medium">{enhancerParsed.protocol.toUpperCase()}</span></div>
                  <div className="flex gap-2"><span className="text-neutral-500 w-16">Server</span><span className="text-neutral-300 font-mono">{enhancerParsed.server}</span></div>
                  <div className="flex gap-2"><span className="text-neutral-500 w-16">Port</span><span className="text-neutral-300">{enhancerParsed.port}</span></div>
                  {enhancerParsed.security !== 'none' && <div className="flex gap-2"><span className="text-neutral-500 w-16">Security</span><span className="text-neutral-300">{enhancerParsed.security}</span></div>}
                </div>
              )}

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Server (Override)</label>
                  <input type="text" placeholder="Auto-filled from URL" value={enhancerOptions.server}
                    onChange={e => setEnhancerOptions({...enhancerOptions, server: e.target.value})}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600" />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Fingerprint (fp)</label>
                  <select value={enhancerOptions.fp}
                    onChange={e => setEnhancerOptions({...enhancerOptions, fp: e.target.value})}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-300 outline-none focus:border-neutral-600">
                    <option value="unsafe">unsafe</option>
                    <option value="chrome">chrome</option>
                    <option value="firefox">firefox</option>
                    <option value="safari">safari</option>
                    <option value="random">random</option>
                    <option value="none">none</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Cipher Suites (cs) — empty to skip</label>
                  <textarea value={enhancerOptions.cs}
                    onChange={e => setEnhancerOptions({...enhancerOptions, cs: e.target.value})}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600 resize-none h-12"
                    placeholder="Defaults from Patterniha (clear to skip)" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Fragment Mask (fm) — empty to skip</label>
                  <textarea value={enhancerOptions.fm}
                    onChange={e => setEnhancerOptions({...enhancerOptions, fm: e.target.value})}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-300 font-mono outline-none focus:border-neutral-600 resize-none h-16"
                    placeholder="Defaults from Patterniha (clear to skip)" />
                </div>
              </div>

              <button onClick={handleEnhance} disabled={!enhancerParsed}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-30 shadow-lg shadow-violet-950/30">
                Enhance URL
              </button>
            </div>

            {/* Enhancer Output */}
            {enhancerResult && (
              <OutputPanel title="Enhanced URL" content={enhancerResult} remark={enhancerRemark}
                onCopy={() => copyToClipboard(enhancerResult, 'Enhanced URL copied')} />
            )}

            <LogPanel logs={logs} />
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: CHAIN BUILDER */}
        {/* ================================================================ */}
        {activeTab === 'chain' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4">
              <h2 className="text-sm font-semibold text-neutral-200 mb-1 flex items-center gap-2">
                <span className="text-violet-400">⛓</span> Chain Builder
              </h2>
              <p className="text-xs text-neutral-500 mb-4">
                Chain two proxy configs into Xray &amp; Sing-box configurations
              </p>

              {/* Two Config Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Config 1 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded bg-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] font-bold">1</span>
                    <span className="text-xs font-medium text-neutral-300">Main Proxy</span>
                    <button
                      onClick={() => toggleSSHMode(1)}
                      className={`ml-auto px-2 py-0.5 text-[9px] font-medium rounded transition-colors ${
                        sshMode1 ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                      title="Switch to SSH mode"
                    >🔑 SSH</button>
                    {chainParsed1 && <span className="text-[10px] text-neutral-500 font-mono">{chainParsed1.protocol.toUpperCase()}</span>}
                  </div>
                  {!sshMode1 ? (
                    <>
                      <textarea value={chainInput1}
                        onChange={e => onChainInputChange(1, e.target.value)}
                        placeholder="vless://uuid@server:port?params#remark"
                        className="w-full min-h-[100px] bg-neutral-950/50 border border-neutral-800 rounded-lg p-3 font-mono text-xs text-neutral-300 focus:ring-1 focus:ring-neutral-600 outline-none resize-y placeholder:text-neutral-700" />
                      {chainParsed1 && (
                        <div className="mt-2 p-2 bg-neutral-950/50 border border-neutral-800 rounded text-[10px] space-y-0.5 text-neutral-400">
                          <div>{chainParsed1.server}:{chainParsed1.port}</div>
                          {chainParsed1.type !== 'tcp' && <div>Transport: {chainParsed1.type}</div>}
                          {chainParsed1.security !== 'none' && <div>Security: {chainParsed1.security}</div>}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 bg-neutral-950/50 border border-neutral-800 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Server</label>
                          <input type="text" placeholder="1.2.3.4 or example.com" value={sshCreds1.server}
                            onChange={e => { setSshCreds1({...sshCreds1, server: e.target.value}); reparseChain(1, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Port</label>
                          <input type="number" value={sshCreds1.port} min="1" max="65535"
                            onChange={e => { setSshCreds1({...sshCreds1, port: parseInt(e.target.value) || 22}); reparseChain(1, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Username</label>
                          <input type="text" placeholder="root" value={sshCreds1.user}
                            onChange={e => { setSshCreds1({...sshCreds1, user: e.target.value}); reparseChain(1, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Password</label>
                          <input type="password" placeholder="Enter password" value={sshCreds1.password}
                            onChange={e => { setSshCreds1({...sshCreds1, password: e.target.value}); reparseChain(1, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Config 2 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded bg-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] font-bold">2</span>
                    <span className="text-xs font-medium text-neutral-300">Chain Proxy</span>
                    <button
                      onClick={() => toggleSSHMode(2)}
                      className={`ml-auto px-2 py-0.5 text-[9px] font-medium rounded transition-colors ${
                        sshMode2 ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                      title="Switch to SSH mode"
                    >🔑 SSH</button>
                    {chainParsed2 && <span className="text-[10px] text-neutral-500 font-mono">{chainParsed2.protocol.toUpperCase()}</span>}
                  </div>
                  {!sshMode2 ? (
                    <>
                      <textarea value={chainInput2}
                        onChange={e => onChainInputChange(2, e.target.value)}
                        placeholder="vless://uuid@server:port?params#remark"
                        className="w-full min-h-[100px] bg-neutral-950/50 border border-neutral-800 rounded-lg p-3 font-mono text-xs text-neutral-300 focus:ring-1 focus:ring-neutral-600 outline-none resize-y placeholder:text-neutral-700" />
                      {chainParsed2 && (
                        <div className="mt-2 p-2 bg-neutral-950/50 border border-neutral-800 rounded text-[10px] space-y-0.5 text-neutral-400">
                          <div>{chainParsed2.server}:{chainParsed2.port}</div>
                          {chainParsed2.type !== 'tcp' && <div>Transport: {chainParsed2.type}</div>}
                          {chainParsed2.security !== 'none' && <div>Security: {chainParsed2.security}</div>}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 bg-neutral-950/50 border border-neutral-800 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Server</label>
                          <input type="text" placeholder="1.2.3.4 or example.com" value={sshCreds2.server}
                            onChange={e => { setSshCreds2({...sshCreds2, server: e.target.value}); reparseChain(2, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Port</label>
                          <input type="number" value={sshCreds2.port} min="1" max="65535"
                            onChange={e => { setSshCreds2({...sshCreds2, port: parseInt(e.target.value) || 22}); reparseChain(2, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Username</label>
                          <input type="text" placeholder="root" value={sshCreds2.user}
                            onChange={e => { setSshCreds2({...sshCreds2, user: e.target.value}); reparseChain(2, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] text-neutral-500 uppercase block mb-0.5">Password</label>
                          <input type="password" placeholder="Enter password" value={sshCreds2.password}
                            onChange={e => { setSshCreds2({...sshCreds2, password: e.target.value}); reparseChain(2, true); }}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-neutral-300 outline-none focus:border-violet-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chain Flow */}
              <div className="flex items-center justify-center gap-2 p-3 mb-4 bg-neutral-950/50 border border-neutral-800 rounded-lg text-xs overflow-x-auto">
                <span className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 font-medium">You</span>
                <span className="text-neutral-600">→</span>
                <span className="px-3 py-1.5 rounded bg-violet-950/60 border border-violet-800/40 text-violet-300 font-medium">
                  {chainParsed1 ? `${chainParsed1.protocol.toUpperCase()}` : 'Proxy'}
                </span>
                <span className="text-neutral-600">→</span>
                <span className="px-3 py-1.5 rounded bg-violet-950/60 border border-violet-800/40 text-violet-300 font-medium">
                  {chainParsed2 ? `${chainParsed2.protocol.toUpperCase()}` : 'Chain'}
                </span>
                <span className="text-neutral-600">→</span>
                <span className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-400">Internet</span>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Remote DNS</label>
                  <select value={chainDns} onChange={e => setChainDns(e.target.value)}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 outline-none">
                    <option value="https://8.8.8.8/dns-query">Google (8.8.8.8)</option>
                    <option value="https://dns.adguard-dns.com/dns-query">AdGuard</option>
                    <option value="https://dns.quad9.net/dns-query">Quad9</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">SOCKS Port</label>
                  <input type="number" value={chainSocksPort} onChange={e => setChainSocksPort(parseInt(e.target.value) || 10808)}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 font-mono outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1">Log Level</label>
                  <select value={chainLogLevel} onChange={e => setChainLogLevel(e.target.value)}
                    className="w-full bg-neutral-950/50 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 outline-none">
                    <option value="none">None</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              <button onClick={handleChainBuild} disabled={!chainParsed1 || !chainParsed2}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-30 shadow-lg shadow-violet-950/30">
                Generate Chained Config
              </button>
            </div>

            {/* Chain Outputs */}
            {chainXrayResult && (
              <div className="space-y-3">
                <OutputPanel title="Xray Configuration" content={chainXrayResult} type="json" remark={chainRemark}
                  onCopy={() => copyToClipboard(chainXrayResult, 'Xray config copied')}
                  onDownload={() => downloadJson(chainXrayResult, `xray-chain.json`)} />
                <OutputPanel title="Sing-box Configuration" content={chainSingboxResult} type="json" remark={chainRemark}
                  onCopy={() => copyToClipboard(chainSingboxResult, 'Sing-box config copied')}
                  onDownload={() => downloadJson(chainSingboxResult, `singbox-chain.json`)} />
                <OutputPanel title="Nekoray Configuration" content={chainNekorayResult} type="json" remark={chainRemark}
                  onCopy={() => copyToClipboard(chainNekorayResult, 'Nekoray config copied')}
                  onDownload={() => downloadJson(chainNekorayResult, `nekoray-chain.json`)} />
                <OutputPanel title="Nekobox Configuration" content={chainNekoboxResult} type="json" remark={chainRemark}
                  onCopy={() => copyToClipboard(chainNekoboxResult, 'Nekobox config copied')}
                  onDownload={() => downloadJson(chainNekoboxResult, `nekobox-chain.json`)} />
              </div>
            )}

            <LogPanel logs={logs} />
          </div>
        )}
      </main>

      {/* ===== Footer ===== */}
      <footer className="border-t border-neutral-800 py-4 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center text-[10px] text-neutral-600">
          V2Ray SubManager v3 <span className="text-violet-500">✦</span> Minimal Edition
        </div>
      </footer>
    </div>
  );
}
