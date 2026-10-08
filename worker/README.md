# Inaayah Game Releases Edge Gateway (Cloudflare Worker)

<p align="center">
  <strong>100% Free Edge Proxy & CDN Caching Gateway for Inaayah Studio Games</strong>
</p>

---

## ⚡ Architecture & Free Tier Benefits

- **100,000 Free Requests / Day:** Built on Cloudflare Workers Free Tier.
- **Minimizes GitHub API Usage:** Caches manifests and latest releases at the edge for 5 minutes (`cacheTtl: 300`). GitHub only receives ~12 requests/hour regardless of player count!
- **Zero Token Leakage:** The GitHub Personal Access Token is stored safely as a Cloudflare Secret (`GITHUB_TOKEN`), completely hidden from the desktop client.
- **Fast Global Downloads:** Streams or 302-redirects player downloads straight to Amazon S3 CDN assets.

---

## 🚀 2-Minute Deployment (Free)

### 1. Authenticate with Cloudflare
```bash
cd worker
npx wrangler login
```

### 2. Store your GitHub Token as a Secret
Create a GitHub Fine-Grained Token (Read-only access to `inaayah` org repo contents & releases), then run:
```bash
npx wrangler secret put GITHUB_TOKEN
# Paste your token when prompted
```

### 3. Deploy to the Edge
```bash
npx wrangler deploy
```

Your worker will instantly be live at:
`https://inaayah-releases.<your-subdomain>.workers.dev` (or route it to `releases.inaayah.dev`!).

---

## 📡 API Endpoints

- `GET /api/games`: Returns aggregated catalog of all games.
- `GET /api/games/:gameId/manifest`: Fetches latest `game-manifest.json`.
- `GET /api/games/:gameId/releases/latest`: Returns latest release details.
- `GET /api/games/:gameId/download/:platform`: 302-redirects to the download zip for `darwin`, `win32`, or `linux`.
