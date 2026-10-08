import { GameCatalogItem } from '../types/launcher';

export const INAAYAH_GAMES_CATALOG: GameCatalogItem[] = [
  {
    "id": "aether-rush",
    "slug": "aether-rush",
    "title": "AetherRush: Cyber Brawler 3D",
    "subtitle": "Classic 90s Arcade 2.5D Beat 'Em Up with Godot 4 3D Graphics",
    "version": "1.2.0",
    "releaseDate": "October 2026",
    "description": "Take back the neon-drenched streets of Aether City! Play as martial arts master Remy or acrobatic kickboxer Hannah across 6 adrenaline-fueled stages. Smash destructible crates, pick up weapons, execute cinematic overhand throws, and battle towering syndicate bosses with smooth gamepad controls and online 2-player co-op.",
    "genres": [
      "Beat 'Em Up",
      "3D Action",
      "Arcade",
      "Online Co-Op"
    ],
    "tags": [
      "Godot 4.3",
      "Full Controller Support",
      "60 FPS",
      "Nakama Multiplayer",
      "Original Soundtrack"
    ],
    "developer": "Inaayah Game Studio",
    "coverArt": "/images/aether-rush-cover.jpg",
    "heroBanner": "/images/aether-rush-banner.jpg",
    "screenshots": [
      "/images/aether-rush-banner.jpg",
      "/images/aether-rush-cover.jpg"
    ],
    "sizeBytes": 89450000,
    "sizeFormatted": "85.3 MB",
    "githubRepo": "inaayah/aether-rush",
    "onlineBackend": "Inaayah Nakama Relay (94.130.227.190)",
    "executableNames": {
      "darwin": "AetherRush.app/Contents/MacOS/AetherRush",
      "win32": "AetherRush.exe",
      "linux": "AetherRush.x86_64"
    },
    "features": [
      "Dual Protagonists: Play as Remy (power puncher) or Hannah (speed & acrobatics)",
      "6 Action-Packed Stages: Downtown Avenue, Neon Alleyway, Subway Rails, Rooftop Helipad, Cargo Docks & Syndicate Tower",
      "Authentic Arcade Sound: Live human reaction voice lines and energetic funk-rock tracks",
      "Full Gamepad Support: Plug-and-play with Xbox, PlayStation, and generic USB controllers",
      "Online Multiplayer: Real-time room joining and state relay on the shared Inaayah Nakama cluster"
    ],
    "requirements": {
      "os": "macOS 12+ / Windows 10/11 64-bit / Ubuntu 22.04+",
      "cpu": "Intel Core i3 / Apple M1 / AMD Ryzen 3 or higher",
      "gpu": "Vulkan 1.2 compatible graphics (Apple Silicon, GTX 960, Radeon RX 560)",
      "ram": "4 GB RAM (8 GB Recommended)",
      "storage": "250 MB free drive space"
    },
    "changelog": [
      {
        "version": "v1.2.0",
        "date": "Oct 8, 2026",
        "title": "Downtown Avenue Ground Alignment & Polished Camera System",
        "changes": [
          "Fixed visual elevation on Downtown Avenue so shoes, trees, and items sit firmly on asphalt",
          "Eliminated floating shadow gaps on all street props and characters",
          "Resolved engine camera device continuity warnings on macOS Sonoma & Sequoia",
          "Fixed SceneTree timer lifecycle to eliminate freed lambda capture logs on scene transitions"
        ]
      },
      {
        "version": "v1.1.0",
        "date": "Oct 7, 2026",
        "title": "6-Stage Full Campaign & Boss Grapple Mechanics",
        "changes": [
          "Expanded campaign from 1 demo stage to 6 full 5-wave stages with unique themes",
          "Added boss grapple immunity and high-impact bowling projectile mechanics for regular thugs",
          "Enhanced Hannah animations with lead jab, right cross, high thrust kick and launcher",
          "Introduced auto-intro attract mode with seamless return to title screen on keypress"
        ]
      },
      {
        "version": "v1.0.0",
        "date": "Oct 6, 2026",
        "title": "Initial 3D Arcade Release",
        "changes": [
          "Godot 4.3 3D side-scrolling beat 'em up engine launch",
          "Integrated Nakama WebSocket relay for 2-player online brawling",
          "Destructible crates and barrels with consumable food drops"
        ]
      }
    ]
  },
  {
    "id": "kettle-court",
    "slug": "kettle-court",
    "title": "Kettle Court",
    "subtitle": "Cozy Medieval Marketplace Digital Board & Table Game",
    "version": "1.0.4",
    "releaseDate": "October 2026",
    "description": "Step into the bustling fairgrounds of Kettle Court! Gather your coin pouch and merchant honors in a lively medieval marketplace digital table game. Claim artisan stalls across Bakery Row, Candle Row, and Harbor Row, draw from the communal Weather Deck, bid at town auctions, and share hot kettle stipends with 2 to 5 players over instant edge multiplayer.",
    "genres": [
      "Board Game",
      "Tabletop",
      "Multiplayer",
      "Cozy Strategy"
    ],
    "tags": [
      "Instant Play",
      "Medieval Market",
      "Edge Durable Objects",
      "Digital Table Game"
    ],
    "developer": "Inaayah Game Studio",
    "coverArt": "/images/kettle-court-cover.jpg",
    "heroBanner": "/images/kettle-court-banner.jpg",
    "screenshots": [
      "/images/kettle-court-banner.jpg",
      "/images/kettle-court-cover.jpg"
    ],
    "gameType": "web",
    "webUrl": "https://kettle-court.inaayah.dev/",
    "sizeBytes": 0,
    "sizeFormatted": "Cloud / Instant Play",
    "githubRepo": "inaayah/kettle-court",
    "onlineBackend": "Cloudflare Durable Objects & WebSockets",
    "features": [
      "40-Step Village Square: Trade across 7 artisan districts including Bakery Row, Herb Row, and Harbor Row",
      "Weather Deck Mechanics: Draw Sun, Drizzle, Gust, and Downpour cards that alter district commerce and fees",
      "No Player Elimination: Even with an empty coin pouch, merchants stay in the court and recover on kettle stipends",
      "Instant Web Play: Powered by Cloudflare Durable Objects for zero-download, low-latency multiplayer rooms"
    ],
    "requirements": {
      "os": "Any Modern OS (Browser / WebGL)",
      "cpu": "2.0 GHz Dual Core or better",
      "gpu": "WebGL 2.0 compatible Browser",
      "ram": "2 GB RAM",
      "storage": "No local disk space required"
    },
    "changelog": [
      {
        "version": "v1.0.4",
        "date": "Oct 6, 2026",
        "title": "Matchmaking Latency & Unit Balancing",
        "changes": [
          "Decreased packet synchronization delay over WebSocket",
          "Balanced mid-lane court defender health pools",
          "Integrated cloud profile syncing"
        ]
      }
    ]
  },
  {
    "id": "cyber-tactics",
    "isComingSoon": true,
    "slug": "cyber-tactics",
    "title": "Cyber Tactics: Syndicate Wars",
    "subtitle": "Turn-Based Sci-Fi Squad Tactics in the Aether Universe",
    "version": "0.9.1 (Alpha Preview)",
    "releaseDate": "Late 2026 (Coming Soon)",
    "description": "Lead an elite cell of cybernetic mercenaries fighting corporate supremacy in turn-based tactical combat. Customize cyberware implants, flank armored enforcers, hack automated defenses, and extract with high-value syndicate data.",
    "genres": [
      "Turn-Based Tactics",
      "Strategy",
      "Cyberpunk",
      "RPG"
    ],
    "tags": [
      "Coming Soon",
      "In Development",
      "Grid Tactics",
      "Deep Customization"
    ],
    "developer": "Inaayah Game Studio",
    "coverArt": "/images/cyber-tactics-cover.jpg",
    "heroBanner": "/images/cyber-tactics-banner.jpg",
    "screenshots": [
      "/images/cyber-tactics-banner.jpg",
      "/images/cyber-tactics-cover.jpg"
    ],
    "sizeBytes": 115000000,
    "sizeFormatted": "109.6 MB",
    "githubRepo": "inaayah/cyber-tactics",
    "executableNames": {
      "darwin": "CyberTactics.app/Contents/MacOS/CyberTactics",
      "win32": "CyberTactics.exe",
      "linux": "CyberTactics.x86_64"
    },
    "features": [
      "Tactical Cover System: Full and half cover with destructible environments",
      "Cyberware Augmentations: Overclock speed, optical camouflage, and neuro-shock",
      "Shared Universe: Set in the same world and syndicate underworld as AetherRush"
    ],
    "requirements": {
      "os": "macOS 12+ / Windows 10+ 64-bit / Linux",
      "cpu": "Quad-Core Processor",
      "gpu": "DirectX 11 / Vulkan compatible GPU",
      "ram": "8 GB RAM",
      "storage": "500 MB free space"
    },
    "changelog": [
      {
        "version": "v0.9.1",
        "date": "Oct 1, 2026",
        "title": "Closed Alpha Preview Build",
        "changes": [
          "Initial tactical grid movement prototype",
          "Unit class balance: Infiltrator, Heavy, Hacker, Combat Medic"
        ]
      }
    ]
  }
];

export const catalogData = INAAYAH_GAMES_CATALOG;
