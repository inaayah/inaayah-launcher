# 100% Free Game Distribution & Launcher Infrastructure

This document outlines the architecture enabling Inaayah Studio to distribute games, deliver auto-updates, and manage catalog metadata at **$0 infrastructure cost**.

---

## 🏗️ Architecture Blueprint

```
                      ┌───────────────────────────────────────────────┐
                      │              INAAYAH LAUNCHER                 │
                      │  (Electron + React 19 Desktop Application)   │
                      └──────────────────────┬────────────────────────┘
                                             │
                       1. Query Manifest     │  2. Download Release Asset
                       & Updates (Cached)    │  (Direct from CDN)
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │       Cloudflare Edge Worker (100k Req/Day Free)       │
                 │                 releases.innayah.dev                   │
                 └───────────┬────────────────────────────────┬───────────┘
                             │                                │
            5-Minute Edge    │                                │ Masks Secret
            Cache Buffer     ▼                                ▼ GitHub Token
                 ┌────────────────────────┐      ┌────────────────────────┐
                 │      GitHub API        │      │     GitHub Releases    │
                 │  (Manifests & Tags)    │      │    (Amazon S3 Storage) │
                 │ 5,000 Calls/Hour Free  │      │ Up to 2 GiB / Asset    │
                 │ (~12 Calls/Hour Used)  │      │   Unlimited Bandwidth  │
                 └────────────────────────┘      └────────────────────────┘
```

---

## 💎 Free Tier Limits & Guarantees

| Service Component | Free Tier Allowance | How Inaayah Studio Uses It | Estimated Monthly Cost |
| :--- | :--- | :--- | :--- |
| **GitHub Releases** | • Max 2 GiB per release asset<br>• Unlimited storage<br>• Unlimited download bandwidth | Stores exported game binaries (`aether-rush-macos.zip`, `windows.zip`, `linux.zip`). | **$0.00** |
| **Cloudflare Workers** | • 100,000 requests / day<br>• 10ms CPU time / request | Serves as edge caching proxy for manifests and masks the private repo GitHub token. | **$0.00** |
| **Cloudflare Edge Cache** | • Unlimited edge cache read/writes | Caches `game-manifest.json` and release metadata for 5 minutes (`cacheTtl: 300`). | **$0.00** |
| **GitHub Actions CI/CD** | • 2,000 runner minutes / month for private repos | Automatically packages game binaries, builds releases, and verifies manifests on `v*` tags. | **$0.00** |
| **GitHub Raw CDN** | • Served via Fastly CDN<br>• No REST API limits | Serves raw metadata directly without consuming the 5,000 hourly REST API quota. | **$0.00** |

---

## 🔒 Security: How Private Tokens Are Protected

1. **No Client-Side Secrets:** The desktop launcher never has access to the studio's admin credentials or private repository write tokens.
2. **Edge Token Masking:** When a player's launcher requests a private download, it talks only to `releases.innayah.dev`. The Cloudflare Worker appends the secret token server-side, requests the signed download redirect from GitHub, and returns a `302 Redirect` to the player.
3. **Internal Dev Mode:** For studio developers running local preview builds without deploying the Cloudflare Worker, the launcher's **Settings Modal** allows entering a temporary read-only Personal Access Token.
