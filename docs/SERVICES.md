# Inaayah Studio — Service Directory & Endpoints

This document serves as the single source of truth for all network endpoints, repositories, server locations, and cloud services powering the Inaayah gaming ecosystem.

---

## 🌐 Network Endpoints Directory

| Service Name | Type | URL / Host | Ports / Protocol | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Unified Studio Backend & Auth Gateway** | Cloudflare Worker + D1 + KV + R2 + Cron | `https://api.inaayah.dev` | `443` (HTTPS) | Studio accounts, 6-digit email OTP verification (`noreply@inaayah.dev`, Reply-To `support@inaayah.dev`), game catalog, telemetry/analytics, daily arcade percentiles, sponsorship 3-tier Halal ad cascade (`/api/sponsor/v1/*`), and daily `0 3 * * *` maintenance cron. |
| **Release Edge Gateway** | Cloudflare Worker (`inaayah-backend`) | `https://releases.inaayah.dev` | `443` (HTTPS) | Authenticated edge caching proxy for `game-manifest.json`, desktop game archives, and incremental patch chunks. Masks private GitHub tokens. |
| **Inaayah Sponsor Showcase & Widget CDN** | Cloudflare Static Assets | `https://sponsor.inaayah.dev` | `443` (HTTPS) | Public sponsor showcase, studio admin publisher dashboard (`sazid@inaayah.dev`), and global `<inaayah-slot>` Web Component CDN (`inaayah-slot.umd.js`). |
| **Inaayah Studio Portal & Launcher** | Static Web + Electron | `https://inaayah.dev` | `443` (HTTPS) | Official studio website, account portal, and cross-platform desktop launcher downloads. |
| **Inaayah Web Arcade** | Cloudflare Pages | `https://arcade.inaayah.dev` | `443` (HTTPS) | Unified daily precision browser games hub (`/eyetest`, `/prism`, `/kinetic`, `/tessera`, `/chrono`, `/vector`). |
| **Kettle Court Web Game** | Edge Web App | `https://kettle-court.inaayah.dev/` | `443` (HTTPS/WSS) | Browser-based instant RTS arena running with Edge Durable Objects for peer synchronization. |
| **Studio Brand Asset CDN** | Cloudflare R2 CDN | `https://cdn.inaayah.dev` | `443` (HTTPS) | Global edge CDN serving canonical studio brand icons (`https://cdn.inaayah.dev/brand/*`). |
| **Inaayah Multiplayer Relay** | Dedicated Server | `94.130.227.190` | `7350` (HTTP/WS)<br>`7349` (gRPC)<br>`7351` (Console) | Nakama multiplayer server for real-time match state, device guest auth, cloud accounts, leaderboards. |

---

## 📁 Repository Directory

| Repository | Local Workspace Path | Scope | Tech Stack | Description |
| :--- | :--- | :--- | :--- | :--- |
| **[`inaayah/inaayah-backend`](https://github.com/inaayah/inaayah-backend)** | `/Users/sazid/Repositories/inaayah-backend` | Unified Backend & Cron Worker | Cloudflare Workers, Hono, TypeScript, D1, KV, R2 | Single consolidated backend serving `api.inaayah.dev` and `releases.inaayah.dev` (Auth, Releases, Telemetry, Sponsor API, Daily Cron). |
| **[`inaayah/inaayah-sponsor`](https://github.com/inaayah/inaayah-sponsor)** | `/Users/sazid/Repositories/inaayah-ads` | Sponsorship Frontend & Widget CDN | pnpm, React 19, Vite, Tailwind, Custom Elements | Public sponsor showcase, admin-gated publisher dashboard, and `<inaayah-slot>` Web Component (`sponsor.inaayah.dev`). |
| **[`inaayah/inaayah-launcher`](https://github.com/inaayah/inaayah-launcher)** | `/Users/sazid/Repositories/inaayah-launcher` | Desktop Launcher & Web Portal | Electron 34, React 19, TypeScript, Vite 6 | Steam-style desktop game launcher, incremental chunk auto-updater, and `inaayah.dev` web portal. |
| **[`inaayah/inaayah-arcade`](https://github.com/inaayah/inaayah-arcade)** | `/Users/sazid/Repositories/inaayah-arcade` | Web Arcade Monorepo | pnpm, Turborepo, React 18, Vite | Daily precision browser games (`Optik`, `Prism`, `Kinetic`, `Tessera`, `Chrono`, `Vector`) at `arcade.inaayah.dev`. |
| **[`inaayah/brand-symbol`](https://github.com/inaayah/brand-symbol)** | `/Users/sazid/Repositories/brand-symbol` | Brand Assets & R2 CDN | Cloudflare R2, SVG | Canonical studio brand symbols synced to `cdn.inaayah.dev/brand/*`. |
| **[`inaayah/aether-rush`](https://github.com/inaayah/aether-rush)** | `/Users/sazid/Repositories/aether-rush` | Game Client | Godot 4.3+, GDScript | 2.5D arcade cyberpunk beat 'em up featuring local & online multiplayer. |
| **[`inaayah/kettle-court`](https://github.com/inaayah/kettle-court)** | `/Users/sazid/Repositories/kettle-court` | Game Client | WebGL, Durable Objects | Fast-paced tactical arena RTS playable directly in the browser or via launcher. |

---

## 🔑 Secrets & Credentials Reference

| Secret Name | Location | Required In | Purpose |
| :--- | :--- | :--- | :--- |
| `GITHUB_TOKEN` | Cloudflare Worker Secrets (`inaayah-api`) | `inaayah-backend` | Fine-grained token with read access to `inaayah` org releases to stream private builds. |
| `RESEND_API_KEY` | Cloudflare Worker Secrets (`inaayah-api`) | `inaayah-backend` | Sends 6-digit OTP verification emails and sponsor escrow notifications from `noreply@inaayah.dev` (Reply-To: `support@inaayah.dev`). |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions Secrets | `inaayah-backend` | Used by `.github/workflows/deploy.yml` in `inaayah-backend` to run D1 migrations and deploy `inaayah-api` after tests pass. |
| `nakama_server_key` | Client Config | Launcher & Games | Default server key (`defaultkey`) used to authenticate guest sessions with Nakama. |

---

## 🛠️ Deployment Runbook (100% Git-Driven CI/CD)

### 1. Deploying Unified Studio Backend (`api.inaayah.dev` & `releases.inaayah.dev`)
- Located in `/Users/sazid/Repositories/inaayah-backend` (`inaayah/inaayah-backend`).
- Run `npm run check` (`tsc --noEmit` + 25 unit & integration tests).
- Push to `main` (triggers `.github/workflows/deploy.yml`) or run `npm run deploy`.

### 2. Deploying Inaayah Sponsor Frontend & Widget CDN (`sponsor.inaayah.dev`)
- Located in `/Users/sazid/Repositories/inaayah-ads` (`inaayah/inaayah-sponsor`).
- Run `pnpm check` and `pnpm run deploy` (or push to `main` to trigger `.github/workflows/deploy-worker.yml`).

### 3. Deploying Inaayah Web Arcade (`arcade.inaayah.dev`)
- Connected directly to Cloudflare via Git (`inaayah/inaayah-arcade`, branch `main`).
- Pushing to `main` (`git push origin main`) automatically runs `pnpm build` and deploys `dist/` to `https://arcade.inaayah.dev`.

### 4. Releasing Desktop Launcher & Website (`inaayah.dev`)
```bash
cd /Users/sazid/Repositories/inaayah-launcher
npm run release:patch # or release:minor / release:major
```
- Bumps `package.json`, tags `vX.Y.Z`, and pushes `origin main --follow-tags` to trigger `.github/workflows/release-launcher.yml`.
