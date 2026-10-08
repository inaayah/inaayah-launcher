# Inaayah Studio — Service Directory & Endpoints

This document serves as the single source of truth for all network endpoints, repositories, server locations, and cloud services powering the Inaayah gaming ecosystem.

---

## 🌐 Network Endpoints Directory

| Service Name | Type | URL / Host | Ports / Protocol | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Inaayah Multiplayer Relay** | Dedicated Server | `94.130.227.190` | `7350` (HTTP/WS)<br>`7349` (gRPC)<br>`7351` (Console) | Nakama multiplayer server for real-time match state, device guest auth, cloud accounts, leaderboards. |
| **Release Edge Gateway** | Cloudflare Worker | `https://releases.inaayah.dev`<br>*(or worker URL)* | `443` (HTTPS) | Free edge caching proxy for `game-manifest.json` and GitHub Releases. Masks private GitHub tokens. |
| **Kettle Court Web Game** | Edge Web App | `https://kettle-court.inaayah.dev/` | `443` (HTTPS/WSS) | Browser-based instant RTS arena running with Edge Durable Objects for peer synchronization. |
| **GitHub Releases CDN** | Static Storage | `github.com/inaayah/*` | `443` (HTTPS) | Free global CDN hosting up to 2 GiB per game build archive without bandwidth fees. |

---

## 📁 Repository Directory

| Repository | Scope | Tech Stack | Description |
| :--- | :--- | :--- | :--- |
| **[`inaayah/aether-rush`](https://github.com/inaayah/aether-rush)** | Game Client | Godot 4.3+, GDScript, Headless Blender | 2.5D arcade cyberpunk beat 'em up featuring local & online multiplayer. |
| **[`inaayah/kettle-court`](https://github.com/inaayah/kettle-court)** | Game Client | WebGL, Durable Objects | Fast-paced tactical arena RTS playable directly in the browser or via launcher. |
| **[`inaayah/inaayah-launcher`](https://github.com/inaayah/inaayah-launcher)** | Client Manager | Electron 34, React 19, TypeScript, Vite 6 | Steam-style desktop launcher, auto-updater, and game library manager. |
| **[`inaayah/inaayah-game-services`](https://github.com/inaayah/inaayah-game-services)** | Backend Submodule | Nakama, CockroachDB/Postgres, Docker | Shared server configurations, TypeScript/Go Nakama runtime modules. |

---

## 🔑 Secrets & Credentials Reference

| Secret Name | Location | Required In | Purpose |
| :--- | :--- | :--- | :--- |
| `GITHUB_TOKEN` | Cloudflare Worker Secrets | `worker` | Fine-grained token with read access to `inaayah` org releases to stream private builds. |
| `GITHUB_TOKEN` | Repository Secrets | `aether-rush/.github` | Default GitHub Actions token used by `softprops/action-gh-release` to publish builds. |
| `nakama_server_key` | Client Config | Launcher & Games | Default server key (`defaultkey`) used to authenticate guest sessions with Nakama. |

---

## 🛠️ Deployment Runbook

### Deploying the Release Gateway
```bash
cd /Users/sazid/Repositories/inaayah-launcher
./scripts/deploy-release-worker.sh
```

### Checking Backend Relay Health
```bash
curl -I http://94.130.227.190:7350/healthcheck
```
