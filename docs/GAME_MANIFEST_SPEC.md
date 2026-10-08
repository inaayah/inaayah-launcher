# Inaayah Game Manifest Specification (`game-manifest.json`)

Every game in the Inaayah Studio ecosystem contains a `game-manifest.json` file in its repository root. The launcher reads this manifest to display store cards, verify versions, download release assets, and launch executables.

---

## 📋 Schema Definition

```typescript
export interface GameManifest {
  // Unique game identifier across the studio (kebab-case)
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  version: string; // Semantic version matching release tag (e.g. "1.2.0")
  releaseDate: string;
  description: string;
  genres: string[];
  tags: string[];
  developer: string;
  coverArt: string;
  heroBanner: string;
  screenshots: string[];

  // Game execution type
  gameType: 'desktop' | 'web';
  webUrl?: string; // Required if gameType === 'web'

  // Backend architecture info
  onlineBackend?: string; // e.g. "Inaayah Nakama Relay (94.130.227.190)" or "Edge Durable Objects"

  // Desktop executables (relative to extracted game folder root)
  executableNames?: {
    darwin: string; // e.g. "AetherRush.app/Contents/MacOS/AetherRush"
    win32: string;  // e.g. "AetherRush.exe"
    linux: string;  // e.g. "AetherRush.x86_64"
  };

  // Asset patterns in GitHub Releases
  assetPatterns?: {
    darwin: string; // e.g. "aether-rush-macos-universal.zip"
    win32: string;  // e.g. "aether-rush-windows-x86_64.zip"
    linux: string;  // e.g. "aether-rush-linux-x86_64.zip"
  };

  sizeBytes?: number;
  sizeFormatted: string; // e.g. "400.5 MB" or "Cloud / Instant Play"
  githubRepo: string;    // e.g. "inaayah/aether-rush"

  features: string[];
  requirements: {
    os: string;
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
  };

  changelog: Array<{
    version: string;
    date: string;
    title: string;
    changes: string[];
  }>;
}
```

---

## 🎮 Examples

### Example 1: Desktop Game (`aether-rush`)
```json
{
  "id": "aether-rush",
  "slug": "aether-rush",
  "title": "AetherRush: Cyber Brawler 3D",
  "subtitle": "High-Octane 2.5D Cyberpunk Beat 'Em Up",
  "version": "1.2.0",
  "releaseDate": "October 2026",
  "description": "Fight through neo-metropolitan streets in this pulse-pounding 2.5D beat 'em up.",
  "genres": ["Action", "Beat 'em Up", "Arcade", "Cyberpunk", "Multiplayer"],
  "tags": ["Godot 4.3", "Full Controller Support", "60 FPS", "Nakama Multiplayer"],
  "developer": "Inaayah Game Studio",
  "coverArt": "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=640&auto=format&fit=crop",
  "heroBanner": "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1920&auto=format&fit=crop",
  "screenshots": [
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1280&auto=format&fit=crop"
  ],
  "sizeBytes": 420000000,
  "sizeFormatted": "400.5 MB",
  "githubRepo": "inaayah/aether-rush",
  "gameType": "desktop",
  "onlineBackend": "Inaayah Nakama Relay (94.130.227.190:7350)",
  "executableNames": {
    "darwin": "AetherRush.app/Contents/MacOS/AetherRush",
    "win32": "AetherRush.exe",
    "linux": "AetherRush.x86_64"
  },
  "assetPatterns": {
    "darwin": "aether-rush-macos-universal.zip",
    "win32": "aether-rush-windows-x86_64.zip",
    "linux": "aether-rush-linux-x86_64.zip"
  },
  "features": [
    "Precision Combat: Multi-hit punch combos, dodge rolls, and dynamic grabs",
    "Nakama Online Multiplayer: Real-time room relay at 60 FPS"
  ],
  "requirements": {
    "os": "macOS 12+ / Windows 10/11 / Linux",
    "cpu": "Quad-Core Intel i5 / AMD Ryzen 3 / Apple M1",
    "gpu": "Vulkan 1.2 / Metal 2 / DirectX 12 GPU",
    "ram": "4 GB RAM",
    "storage": "850 MB space"
  },
  "changelog": [
    {
      "version": "1.2.0",
      "date": "Oct 8, 2026",
      "title": "Story Intro & Boss Throw Mechanics",
      "changes": ["Boss immunity to grabs", "Hanna acrobatic double kicks"]
    }
  ]
}
```

### Example 2: Instant Web Game (`kettle-court`)
```json
{
  "id": "kettle-court",
  "slug": "kettle-court",
  "title": "Kettle Court: Court of Kettle",
  "subtitle": "High-Stakes Multiplayer Arena RTS and Tactician Duels",
  "version": "1.0.4",
  "releaseDate": "October 2026",
  "description": "Command your court in fast-paced real-time tactical battles.",
  "genres": ["Real-Time Strategy", "Tactics", "Competitive"],
  "tags": ["Instant Play", "Fast-Paced RTS", "Edge Durable Objects"],
  "developer": "Inaayah Game Studio",
  "coverArt": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop",
  "heroBanner": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=1920&auto=format&fit=crop",
  "screenshots": [
    "https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1280&auto=format&fit=crop"
  ],
  "sizeBytes": 0,
  "sizeFormatted": "Cloud / Instant Play",
  "githubRepo": "inaayah/kettle-court",
  "gameType": "web",
  "webUrl": "https://kettle-court.inaayah.dev/",
  "onlineBackend": "Edge Durable Objects (WebSockets)",
  "features": [
    "Zero-Install: Instant play in browser or frameless game window",
    "Durable Objects Backend: Low latency match synchronization"
  ],
  "requirements": {
    "os": "Any Modern OS (Browser / WebGL)",
    "cpu": "Dual-Core 2.0 GHz",
    "gpu": "WebGL 2.0 compatible browser",
    "ram": "2 GB RAM",
    "storage": "0 MB local disk space"
  },
  "changelog": [
    {
      "version": "1.0.4",
      "date": "Oct 6, 2026",
      "title": "Matchmaking Latency & Unit Balancing",
      "changes": ["Optimized WebSocket packet sizes", "Balanced court defender health"]
    }
  ]
}
```

---

## 🚀 How to Add a New Game to the Launcher

1. Place `game-manifest.json` in the root of your game's GitHub repository.
2. In `inaayah-launcher`, add the game ID to `REGISTERED_GAMES` in `worker/src/index.ts` (or `src/data/catalog.ts` for offline fallback).
3. The launcher will automatically fetch the new game, display it in the store, and allow players to install or launch it!
