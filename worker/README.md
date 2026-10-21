# Inaayah Studio API & Releases Gateway (`inaayah-api`)

<p align="center">
  <strong>100% Free Edge API, Account Auth, Telemetry & Release Caching Gateway for Inaayah Studio</strong>
</p>

---

## ⚡ Architecture & Free Tier Benefits

- **100,000 Free Requests / Day:** Built on Cloudflare Workers Free Tier.
- **Minimizes GitHub API Usage:** Caches release metadata, catalog source and published manifests for seven days per edge location; warm requests do not contact GitHub.
- **Zero Token Leakage:** The GitHub Personal Access Token is stored safely as a Cloudflare Secret (`GITHUB_TOKEN`), completely hidden from the desktop client.
- **Fast Global Downloads:** Redirects package downloads to GitHub’s release CDN, with a short cache for signed URLs.

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
`https://inaayah-api.<your-subdomain>.workers.dev` (and routed to `api.inaayah.dev` + `releases.inaayah.dev`!).

---

## 📡 API Endpoints

- `GET /api/games`: Returns aggregated catalog of all games.
- `GET /api/games/:gameId/manifest`: Fetches latest `game-manifest.json`.
- `GET /api/games/:gameId/releases/latest`: Returns latest release details.
- `GET /api/games/:gameId/download/:platform`: 302-redirects to the download zip for `darwin`, `win32`, or `linux`.


## Release gateway caching

`inaayah-releases` keeps successful release metadata, catalog source and published
game manifests in Cloudflare's edge Cache API for **seven days**. A warm request
does not contact GitHub. Cold caches and evictions can require fresh GitHub reads
at each Cloudflare location; this is not a single global cache.

Signed asset redirects have a separate **60-second** cache because GitHub's signed
URLs expire. Package bytes travel directly from GitHub's download CDN. Failed
GitHub requests are never cached, and credentials are never stored in cached
responses or forwarded to the download host. Public metadata responses require
browser revalidation, which reads the edge cache rather than calling GitHub.

## Refresh after each release

1. Wait for the game or launcher GitHub release and all its assets to finish publishing.
2. From the launcher repository run `npm run refresh:releases -- v1.0.1` (choose a
   new revision each time). This updates `CACHE_REVISION` and deploys the worker,
   retaining the existing Cloudflare `GITHUB_TOKEN` secret.
3. Open `https://releases.inaayah.dev/api/games` and the latest-release endpoint
   to warm the cache, then verify each platform download. Commit the changed
   `worker/wrangler.toml` so later deployments keep the current revision.

The revision is part of every internal cache key. Deploying a new revision makes
all locations stop using the old namespace without a zone-wide purge or an
extra cache-purge secret. Old entries expire normally. A unique timestamp is
used when no revision is supplied. `--prepare-only` updates configuration without
deploying; this is useful when checking changes before a release.

Use the same refresh command after rotating the GitHub token or changing catalog
metadata. Do not reuse an old revision, since its cached snapshots can still exist.
If a release has a `game-manifest.json` asset, its measured sizes, executable paths
and SHA-256 values replace the catalog's older values automatically on refresh.

## Token permissions

Use a fine-grained GitHub token with resource owner `inaayah`, selected repositories
`vigilante-red-city`, `aether-rush` and `inaayah-launcher`, and **Contents: Read-only**.
Metadata read access is automatic. Obtain organization approval when required.
Store the token as the Cloudflare worker secret named `GITHUB_TOKEN`.

## Validation

Run `npm run test:worker` and `npx tsc --noEmit -p worker/tsconfig.json`.

Catalog artwork hosted on `inaayah.dev/images/` receives the same cache revision
as a URL query. Refreshing a release also refreshes artwork in older launchers,
including clients that cached the previous missing-image response.
