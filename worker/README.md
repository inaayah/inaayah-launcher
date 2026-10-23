# Inaayah Studio API & Releases Gateway (`inaayah-api`)

<p align="center">
  <strong>100% Free Edge API, Account Auth, Telemetry & Release Caching Gateway for Inaayah Studio</strong>
</p>

---

## ⚡ Architecture & Free Tier Benefits

- **100,000 Free Requests / Day:** Built on Cloudflare Workers Free Tier.
- **Minimizes GitHub API Usage:** Caches immutable manifests and catalog sources for seven days; latest-release pointers expire after two minutes and switch immediately after an authenticated publication.
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

Immutable manifests and catalog sources use a seven-day edge cache. Latest-release
pointers have a two-minute fallback TTL. Signed asset redirects expire after at most
60 seconds. Failed GitHub reads are never cached; credentials never reach the CDN.

## Automatic release publication

After all GitHub release assets are published, call the shared composite action:

```yaml
permissions:
  contents: write
  id-token: write
# Last step, including when an existing complete release skips its build:
- uses: inaayah/inaayah-launcher/.github/actions/publish-release@main
  with:
    game-id: vigilante-red-city
    version: ${{ github.ref_name }}
```

Pin the action to a reviewed commit in consuming repositories. The action obtains
a short-lived GitHub OIDC identity with audience `https://releases.inaayah.dev`;
no additional repository secret is required. The gateway verifies its signature,
issuer, audience, repository, main/release-tag ref and exact release workflow path.
Only `.github/workflows/release.yml` for games and `release-launcher.yml` for the
launcher can synchronize. Forks, pull requests and feature branches are rejected.

`POST /api/releases/sync` validates the latest stable release, desktop assets,
measured manifest and incremental packages before atomically changing a shared D1
revision. Every edge location reads this revision, so warm caches switch together.
Retrying the same publication is idempotent. An older or partial release cannot
replace the published channel.

The action checks latest release, catalog, manifest, all three desktop redirects,
archive byte ranges and incremental links. Failed verification fails the workflow;
rerun publication to repair distribution without rebuilding the game. The studio
website and launcher read these same endpoints.

For a read-only check, set `INAAYAH_RELEASE_ID`, `INAAYAH_RELEASE_VERSION` and run
`python3 .github/actions/publish-release/publish.py --verify-only`.

The existing `npm run refresh:releases -- UNIQUE_REVISION` command remains an
administrative fallback for token rotation or catalog changes; it is no longer a
required manual step after each release. D1 schema migration must succeed before
worker deployment. Old edge entries expire naturally.

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

Launcher installer recovery: manually dispatch `Release Launcher Installers` on
`main` with the existing `release_tag` and the failed `platform`. Successful
platform assets are retained, the version tag is unchanged, and final publication
still verifies all desktop installers and updater metadata before succeeding.
