# Inaayah Game Launcher & Manager

<p align="center">
  <strong>The official cross-platform game launcher, library manager, and auto-updater for Inaayah Studio titles.</strong>
</p>

---

## 🚀 Overview

**Inaayah Launcher** is a Steam-inspired desktop application built with **Electron**, **React 19**, **TypeScript**, and **Vite**. It provides gamers with a seamless way to install, update, and launch Inaayah Studio games (such as *AetherRush: Cyber Brawler 3D*, *Kettle Court*, and *Cyber Tactics*), with zero manual configuration.

All game builds and updates are distributed directly from **GitHub Releases** (providing 100% free CDN hosting with up to 2 GiB per asset zip and unlimited bandwidth) combined with our central Nakama multiplayer infrastructure (`94.130.227.190`).

---

## ✨ Features

- **🎮 Steam-Style Unified Library:**
  - One-click install, background auto-update, and direct play.
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
├── electron/
│   ├── main.ts            # Electron main process (IPC, downloads, process spawning, file I/O)
│   └── preload.ts         # Secure contextBridge IPC layer exposing `window.inaayahLauncher`
├── src/
│   ├── components/        # React UI components
│   │   ├── TitleBar.tsx       # Custom frameless title bar with Nakama status & window controls
│   │   ├── Sidebar.tsx        # Navigation & quick-access installed games list
│   │   ├── GameHero.tsx       # Detail page with hero banner, big action button, and tabs
│   │   ├── StoreCatalog.tsx   # Catalog discovery grid with genre filters & search
│   │   ├── DownloadsQueue.tsx # Real-time downloads manager with speed & ETA
│   │   └── SettingsModal.tsx  # Library location picker, auto-update toggle, Nakama IP
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

### 3. Run in Web Browser (Fast UI Iteration)
```bash
npm run dev
```
> In browser mode, simulated downloads and in-memory mock games allow full UI testing without Electron.

### 4. Run Desktop Electron App
```bash
npm start
```
> Compiles both the React frontend and Electron main process into `dist/` and launches the native frameless desktop window.

### 5. Type Checking & Verification
```bash
npm run lint
npm run build:renderer
```

---

## 📦 Packaging & Distribution

To create standalone production installers for your operating system:

```bash
# Package for current OS (macOS DMG/ZIP, Windows NSIS/EXE, Linux AppImage)
npm run dist
```

Installers are generated inside the `release/` folder.

---

## 🚀 How to Publish a Game to the Launcher

1. **Tag and Release on GitHub:**
   - In your game repo (e.g. `inaayah/aether-rush`), create a new tag like `v1.2.0`.
   - Export your Godot game binary into a ZIP archive named:
     - `aether-rush-macos-universal.zip`
     - `aether-rush-windows-x86_64.zip`
     - `aether-rush-linux-x86_64.zip`
   - Attach the ZIPs to the GitHub Release.
2. **Update Catalog (`src/data/catalog.ts`):**
   - Bump the `version` field to match your release tag.
   - Add new patch notes to the `changelog` array.
3. The launcher will automatically detect the new release for all users, display the **"UPDATE AVAILABLE"** badge, and download/extract the update in one click!

---

## 📄 License
Private & Confidential — Proprietary to Inaayah Studio. All Rights Reserved.
