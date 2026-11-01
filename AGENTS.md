# Inaayah Launcher & Studio Website (`inaayah-launcher`) — Agent Rules & Architecture Guide

> **Canonical Studio Architecture, Bootstrap Runbook & New-Repo Template**:
> - Cloud Source of Truth: [`https://github.com/inaayah/inaayah-studio`](https://github.com/inaayah/inaayah-studio)
> - Local Master Guide: [`/Users/sazid/Repositories/AGENTS.md`](file:///Users/sazid/Repositories/AGENTS.md) -> [`/Users/sazid/Repositories/inaayah-studio/AGENTS.md`](file:///Users/sazid/Repositories/inaayah-studio/AGENTS.md)
> - Laptop / Cloud Disaster Recovery: [`/Users/sazid/Repositories/inaayah-studio/BOOTSTRAP.md`](file:///Users/sazid/Repositories/inaayah-studio/BOOTSTRAP.md)
> - Creating a New Repo: [`/Users/sazid/Repositories/inaayah-studio/REPO_TEMPLATE.md`](file:///Users/sazid/Repositories/inaayah-studio/REPO_TEMPLATE.md)

## 1. Repository Role & Architecture Boundaries
- **Local Path**: `/Users/sazid/Repositories/inaayah-launcher`
- **GitHub Remote**: `git@github.com:inaayah/inaayah-launcher.git`
- **Production Domain**: `https://inaayah.dev` (Web Portal) + Native Desktop Installers (macOS DMG/ZIP, Windows NSIS/ZIP, Linux AppImage/tar.gz)
- **Where is the Backend Worker (`api.inaayah.dev` & `releases.inaayah.dev`)?**
  - All backend API routes (`/api/auth/*`, `/api/games/*`, `/api/launcher/*`, `/api/telemetry/*`, `/api/analytics/*`, `/api/sponsor/*`) and the edge release proxy (`https://releases.inaayah.dev`) live in the dedicated **`inaayah/inaayah-backend`** repository (`/Users/sazid/Repositories/inaayah-backend`).
  - Do **not** add Cloudflare Worker code to `inaayah-launcher`; modify `/Users/sazid/Repositories/inaayah-backend` instead.

---

## 2. Desktop Launcher & Website Release Policy (`inaayah.dev`)
- **ALWAYS** release the desktop launcher via `npm run release:patch` (`minor` / `major`).
- This bumps `package.json`, creates a version tag (`vX.Y.Z`), and pushes `origin main --follow-tags`, triggering `.github/workflows/release-launcher.yml`.
- **DO NOT** manually copy build outputs into `/Applications/`.

---

## 3. How to Build Features Across `inaayah-launcher` and `inaayah-backend`

### Scenario A: Adding a New UI Feature or IPC Handler in the Desktop Launcher
1. **Electron Main / Preload**: Edit [`electron/main.ts`](file:///Users/sazid/Repositories/inaayah-launcher/electron/main.ts) and [`electron/preload.ts`](file:///Users/sazid/Repositories/inaayah-launcher/electron/preload.ts).
2. **React Renderer / Web Portal**: Edit [`src/App.tsx`](file:///Users/sazid/Repositories/inaayah-launcher/src/App.tsx), [`src/components/`](file:///Users/sazid/Repositories/inaayah-launcher/src/components), and [`src/services/electronBridge.ts`](file:///Users/sazid/Repositories/inaayah-launcher/src/services/electronBridge.ts).
3. **Verify**: Run `npm run lint && npm run test:updater && npm run test:renderer`.

### Scenario B: Adding a New Game to the Catalog
1. Add `game-manifest.json` in the game's repository root (`inaayah/<game-slug>`).
2. In **`/Users/sazid/Repositories/inaayah-backend`**, add the game to `games-catalog.json` and `REGISTERED_GAMES` in `src/index.ts`, then run `npm run check && npm run deploy`.
3. In **`/Users/sazid/Repositories/inaayah-launcher`**, update `games-catalog.json` / `src/data/catalog.ts` for offline fallback.
