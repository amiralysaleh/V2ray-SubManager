# V2Ray SubManager

All-in-one subscription manager and proxy toolchain — process, enhance, and chain proxy configurations.

🔗 **Live:** [amiralysaleh.github.io/V2ray-SubManager](https://amiralysaleh.github.io/V2ray-SubManager/)

---

## Features

### 1. Subscription Manager
- **Import** subscription URLs (VMess, VLESS, Trojan, Shadowsocks, SSR)
- **Process** configs with Mux, Fragment, ALPN, Insecure, Custom CDN IP
- **Geo-Rename** — auto-detect server location and rename with flag + country
- **Publish** to GitHub Gist (create new or update existing)
- **Ping Test** — measure server latency

### 2. URL Enhancer
- Inject **cs** (cipher suites), **fm** (fragment mask), **fp** (fingerprint) into VLESS/Trojan URLs
- Override server address
- Anti-DPI fragment settings

### 3. Chain Builder
- Chain two proxy configs into full configuration files
- Output formats: **Xray JSON**, **Sing-box**, **Nekoray**, **Nekobox**
- Supports: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP

---

## Getting Started

### Local Development

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Production Build

```bash
npm run build
npm run preview
# → http://localhost:4173/V2ray-SubManager/
```

### GitHub Token Setup

The token is injected at **build time** via `VITE_GITHUB_TOKEN` (never shipped in source code).

**For local dev:**
```bash
# Create .env file (never committed)
echo "VITE_GITHUB_TOKEN=ghp_your_token_here" > .env
npm run dev
```

**For GitHub Pages (automatic via Actions):**
1. Go to repo **Settings → Secrets and variables → Actions**
2. Add **New repository secret** → Name: `MY_GH_TOKEN`, Value: your GitHub classic token (with `gist` scope)
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds and deploys automatically

---

## Tech Stack

React 19 + TypeScript + Vite 6 + Tailwind CSS 4

## License

MIT
