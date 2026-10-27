# Inaayah Launcher & Studio API (`inaayah-launcher`) — Agent Rules

## 1. Cloudflare Worker (`worker/` -> `api.inaayah.dev` & `releases.inaayah.dev`)
- Deployed **automatically** by GitHub Actions (`.github/workflows/deploy-worker.yml`) on every push to `main` that modifies `worker/**`, `games-catalog.json`, or `scripts/refresh_release_cache.py`.
- **DO NOT** run `./scripts/deploy-release-worker.sh` or `wrangler deploy` manually unless debugging a CI outage.

## 2. Desktop Launcher & Website Releases (`inaayah.dev`)
- **ALWAYS** release the desktop launcher via `npm run release:patch` (`minor` / `major`).
- This bumps `package.json`, creates a version tag (`vX.Y.Z`), and pushes `origin main --follow-tags`, triggering `.github/workflows/release-launcher.yml`.
- **DO NOT** manually copy build outputs into `/Applications/`.
