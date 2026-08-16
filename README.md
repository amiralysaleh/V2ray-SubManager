# V2ray-SubManager

All-in-one subscription manager and proxy toolchain — process, enhance, and chain proxy configurations.

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
- Output formats:
  - **Xray JSON** — v2rayN, v2rayNG, Nekoray
  - **Sing-box JSON** — standard sing-box config
  - **Nekoray** — Sing-box compatible, client-optimized
  - **Nekobox** — Android-optimized tun config
- Supported protocols: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP

---

## Getting Started

### Prerequisites
- Node.js 18+
- GitHub Personal Access Token (for Gist publishing)

### Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Configure GitHub Token

Copy `.env.example` to `.env` and add your token:

```
VITE_GITHUB_TOKEN=ghp_your_token_here
```

> Token needs the **gist** scope. Create one at https://github.com/settings/tokens

---

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- GitHub Gist API
- GeoIP via ipwho.is / ipapi.co

---

## Development

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run preview # Preview production build
```

## License

MIT
