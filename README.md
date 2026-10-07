# Inaayah Game Launcher & Manager

<p align="center">
  <strong>The official cross-platform game launcher, library manager, and auto-updater for Inaayah Studio titles.</strong>
</p>

---

## 📚 Essential Documentation

| Document | Purpose |
| :--- | :--- |
| **[`docs/SERVICES.md`](docs/SERVICES.md)** | Single source of truth for all server IPs, Nakama ports, web games, and GitHub repos. |
| **[`docs/FREE_INFRASTRUCTURE.md`](docs/FREE_INFRASTRUCTURE.md)** | Complete blueprint explaining how GitHub Releases, Cloudflare Workers, and CDN caching run at **$0 cost**. |
| **[`docs/GAME_MANIFEST_SPEC.md`](docs/GAME_MANIFEST_SPEC.md)** | Standard specification for `game-manifest.json` in game repositories. |

---

## 🚀 Overview

**Inaayah Launcher** is a Steam-inspired desktop application built with **Electron**, **React 19**, **TypeScript**, and **Vite**. It provides gamers with a seamless way to install, update, and launch Inaayah Studio games (such as *AetherRush: Cyber Brawler 3D*, *Kettle Court*, and *Cyber Tactics*), with zero manual configuration.

All game builds and updates are distributed directly from **GitHub Releases** (providing 100% free CDN hosting with up to 2 GiB per asset zip and unlimited bandwidth) combined with our central Nakama multiplayer infrastructure (`94.130.227.190`).

---

## ✨ Features

- **🎮 Steam-Style Unified Library:**
  - One-click install, background auto-update, and direct play.
  - Supports both **Desktop Binaries** and **Instant Web Games** (`https://kettle-court.innayah.dev`).
  - Tracks total playtime and last-played timestamps.
  - Direct links to game folders, patch notes, screenshots lightbox, and hardware specifications.
- **⚡ High-Performance Streaming Downloader:**
  - Chunked streaming with real-time download speed calculation (MB/s), live percentage, and accurate ETA estimates.
  - Automatic ZIP decompression via `adm-zip` and executable permission restoration (`chmod +x` on macOS and Linux).
- **🔄 GitHub Releases Auto-Updating:**
  - Checks remote GitHub repository releases for newer semantic versions.
  - Delta/package downloads with smooth progress bars and restart workflows.
- **🛠️ Godot Local Dev Auto-Runner:**
  - When running in developer mode, the launcher automatically detects local working directories (e.g. `/Users/sazid/Repositories/aether-rush/godot`) and launches the game directly using the local Godot 4.x engine!
- **🌐 Nakama Multiplayer Monitoring:**
  - Status indicator pinging the central Inaayah Nakama cluster (`94.130.227.190:7350`).
- **🎨 Frameless Cyberpunk Aesthetics:**
  - Sleek dark theme with neon cyan (`#00f0ff`), magenta (`#ff0055`), and green accents, glassmorphic card overlays, and custom window controls.
- **🌐 Dual-Mode Architecture:**
  - Runs natively as an **Electron Desktop App** or as a **Browser Web App** (`npm run dev`) with automated mock fallbacks for rapid frontend iteration.

---

## 📁 Repository Structure

```
inaayah-launcher/
├── docs/                  # Architecture & operations documentation
│   ├── SERVICES.md            # Live server endpoints, repos, Nakama IPs
│   ├── FREE_INFRASTRUCTURE.md # 100% free CDN & proxy architecture
│   └── GAME_MANIFEST_SPEC.md  # Standard game-manifest.json specification
├── scripts/               # Operational automation scripts
│   └── deploy-release-worker.sh # 1-click deployment for Cloudflare Worker
├── worker/                # Free Cloudflare Worker release caching proxy
│   ├── src/index.ts           # Worker proxy & token masking logic
│   ├── wrangler.toml          # Worker configuration (free tier)
│   └── README.md              # Worker deployment guide
├── electron/
│   ├── main.ts            # Electron main process (IPC, downloads, process spawning)
│   └── preload.ts         # Secure contextBridge IPC layer exposing `window.inaayahLauncher`
├── src/
│   ├── components/        # React UI components
│   │   ├── TitleBar.tsx       # Custom frameless title bar with Nakama status
│   │   ├── Sidebar.tsx        # Navigation & quick-access installed games list
│   │   ├── GameHero.tsx       # Detail page with hero banner & action button
│   │   ├── StoreCatalog.tsx   # Catalog discovery grid with genre filters & search
│   │   ├── DownloadsQueue.tsx # Real-time downloads manager with speed & ETA
│   │   └── SettingsModal.tsx  # Library location, edge gateway, GitHub token
│   ├── data/
│   │   └── catalog.ts         # Game catalog metadata, changelogs, system specs
│   ├── services/
│   │   └── electronBridge.ts  # Universal IPC bridge with browser simulation fallback
│   ├── types/
│   │   └── launcher.ts        # TypeScript data contracts & IPC interfaces
│   ├── App.tsx            # Root application layout & state machine
│   ├── main.tsx           # React entry point
│   └── index.css          # Design system, Outfit typography, glassmorphism
├── package.json           # Scripts, dependencies, electron-builder targets
└── vite.config.ts         # Vite bundler configuration
```

---

## 🛠️ Development & Running Locally

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Desktop Electron App (Hot-Reloading)
```bash
npm run dev
# OR
npm start
```
> Automatically compiles frontend and launches the native frameless desktop window.

### 4. Deploy Free Edge Release Gateway
```bash
npm run deploy:worker
```
> Deploys the free Cloudflare Worker caching gateway to `releases.innayah.dev`.

### 5. Packaging & Distribution
```bash
# Package for current OS (macOS DMG/ZIP, Windows NSIS/EXE, Linux AppImage)
npm run dist
```

Installers are generated inside the `release/` folder.

---

## 🚀 How to Publish a Game to the Launcher

1. **Add `game-manifest.json` in your Game Repo:**
   - Follow [`docs/GAME_MANIFEST_SPEC.md`](docs/GAME_MANIFEST_SPEC.md).
2. **Tag and Push to GitHub:**
   - In your game repo (e.g. `inaayah/aether-rush`), create a new tag like `v1.2.0`:
     ```bash
     git tag v1.2.0
     git push origin v1.2.0
     ```
   - The GitHub Actions workflow (`.github/workflows/release.yml`) builds the release and uploads the `.zip` packages automatically.
3. The launcher automatically queries the manifest and alerts all players with an **"UPDATE AVAILABLE"** one-click install button!

---

## 📄 License
Private & Confidential — Proprietary to Inaayah Studio. All Rights Reserved.
