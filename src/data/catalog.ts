import { GameCatalogItem } from '../types/launcher';

export const INAAYAH_GAMES_CATALOG: GameCatalogItem[] = [
  {
    id: 'aether-rush',
    slug: 'aether-rush',
    title: 'AetherRush: Cyber Brawler 3D',
    subtitle: 'Classic 90s Arcade 2.5D Beat \'Em Up with Godot 4 3D Graphics',
    version: '1.2.0',
    releaseDate: 'October 2026',
    description:
      'Take back the neon-drenched streets of Aether City! Play as martial arts master Remy or acrobatic kickboxer Hannah across 6 adrenaline-fueled stages. Smash destructible crates, pick up weapons, execute cinematic overhand throws, and battle towering syndicate bosses with smooth gamepad controls and online 2-player co-op.',
    genres: ['Beat \'Em Up', '3D Action', 'Arcade', 'Online Co-Op'],
    tags: ['Godot 4.3', 'Full Controller Support', '60 FPS', 'Nakama Multiplayer', 'Original Soundtrack'],
    developer: 'Inaayah Game Studio',
    coverArt: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=640&auto=format&fit=crop',
    heroBanner: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920&auto=format&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1280&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1280&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1280&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1280&auto=format&fit=crop'
    ],
    sizeBytes: 89450000,
    sizeFormatted: '85.3 MB',
    githubRepo: 'inaayah/aether-rush',
    executableNames: {
      darwin: 'AetherRush.app/Contents/MacOS/AetherRush',
      win32: 'AetherRush.exe',
      linux: 'AetherRush.x86_64'
    },
    features: [
      'Dual Protagonists: Play as Remy (power puncher) or Hannah (speed & acrobatics)',
      '6 Action-Packed Stages: Downtown Avenue, Neon Alleyway, Subway Rails, Rooftop Helipad, Cargo Docks & Syndicate Tower',
      'Authentic Arcade Sound: Live human reaction voice lines and energetic funk-rock tracks',
      'Full Gamepad Support: Plug-and-play with Xbox, PlayStation, and generic USB controllers',
      'Online Multiplayer: Real-time room joining and state relay on the shared Inaayah Nakama cluster'
    ],
    requirements: {
      os: 'macOS 12+ / Windows 10/11 64-bit / Ubuntu 22.04+',
      cpu: 'Intel Core i3 / Apple M1 / AMD Ryzen 3 or higher',
      gpu: 'Vulkan 1.2 compatible graphics (Apple Silicon, GTX 960, Radeon RX 560)',
      ram: '4 GB RAM (8 GB Recommended)',
      storage: '250 MB free drive space'
    },
    changelog: [
      {
        version: 'v1.2.0',
        date: 'Oct 8, 2026',
        title: 'Downtown Avenue Ground Alignment & Polished Camera System',
        changes: [
          'Fixed visual elevation on Downtown Avenue so shoes, trees, and items sit firmly on asphalt',
          'Eliminated floating shadow gaps on all street props and characters',
          'Resolved engine camera device continuity warnings on macOS Sonoma & Sequoia',
          'Fixed SceneTree timer lifecycle to eliminate freed lambda capture logs on scene transitions'
        ]
      },
      {
        version: 'v1.1.0',
        date: 'Oct 7, 2026',
        title: '6-Stage Full Campaign & Boss Grapple Mechanics',
        changes: [
          'Expanded campaign from 1 demo stage to 6 full 5-wave stages with unique themes',
          'Added boss grapple immunity and high-impact bowling projectile mechanics for regular thugs',
          'Enhanced Hannah animations with lead jab, right cross, high thrust kick and launcher',
          'Introduced auto-intro attract mode with seamless return to title screen on keypress'
        ]
      },
      {
        version: 'v1.0.0',
        date: 'Oct 6, 2026',
        title: 'Initial 3D Arcade Release',
        changes: [
          'Godot 4.3 3D side-scrolling beat \'em up engine launch',
          'Integrated Nakama WebSocket relay for 2-player online brawling',
          'Destructible crates and barrels with consumable food drops'
        ]
      }
    ]
  },
  {
    id: 'kettle-court',
    slug: 'kettle-court',
    title: 'Kettle Court: Court of Kettle',
    subtitle: 'High-Stakes Multiplayer Arena RTS and Tactician Duels',
    version: '1.0.4',
    releaseDate: 'October 2026',
    description:
      'Command your court in fast-paced real-time tactical battles. Place combat units, manage energy thresholds, counter opponent formations, and capture strategic court zones with shared backend account progression and cross-platform matchmaking.',
    genres: ['Real-Time Strategy', 'Tactics', 'Multiplayer', 'Competitive'],
    tags: ['Godot 4.3', 'Fast-Paced RTS', 'Matchmaking', 'Ranked Leaderboard'],
    developer: 'Inaayah Game Studio',
    coverArt: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop',
    heroBanner: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=1920&auto=format&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1280&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1280&auto=format&fit=crop'
    ],
    sizeBytes: 63100000,
    sizeFormatted: '60.2 MB',
    githubRepo: 'inaayah/kettle-court',
    executableNames: {
      darwin: 'KettleCourt.app/Contents/MacOS/KettleCourt',
      win32: 'KettleCourt.exe',
      linux: 'KettleCourt.x86_64'
    },
    features: [
      'Dynamic Court Control: Real-time unit spawning and zone defense',
      'Inaayah Network Backend: Cloud progress, device-based guest login, and match relays',
      'Low Latency: Built for instantaneous peer reaction at 60 FPS'
    ],
    requirements: {
      os: 'macOS 11+ / Windows 10 64-bit / Linux',
      cpu: '2.0 GHz Dual Core or better',
      gpu: 'OpenGL 3.3 / Vulkan 1.0 compatible GPU',
      ram: '2 GB RAM',
      storage: '150 MB free space'
    },
    changelog: [
      {
        version: 'v1.0.4',
        date: 'Oct 6, 2026',
        title: 'Matchmaking Latency & Unit Balancing',
        changes: [
          'Decreased packet synchronization delay over WebSocket',
          'Balanced mid-lane court defender health pools',
          'Integrated cloud profile syncing'
        ]
      }
    ]
  },
  {
    id: 'cyber-tactics',
    slug: 'cyber-tactics',
    title: 'Cyber Tactics: Syndicate Wars',
    subtitle: 'Turn-Based Sci-Fi Squad Tactics in the Aether Universe',
    version: '0.9.1',
    releaseDate: 'November 2026 (Coming Soon)',
    description:
      'Lead an elite cell of cybernetic mercenaries fighting corporate supremacy in turn-based tactical combat. Customize cyberware implants, flank armored enforcers, hack automated defenses, and extract with high-value syndicate data.',
    genres: ['Turn-Based Tactics', 'Strategy', 'Cyberpunk', 'RPG'],
    tags: ['Coming Soon', 'Procedural Missions', 'Grid Tactics', 'Deep Customization'],
    developer: 'Inaayah Game Studio',
    coverArt: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=640&auto=format&fit=crop',
    heroBanner: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1920&auto=format&fit=crop',
    screenshots: [
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1280&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1280&auto=format&fit=crop'
    ],
    sizeBytes: 115000000,
    sizeFormatted: '109.6 MB',
    githubRepo: 'inaayah/cyber-tactics',
    executableNames: {
      darwin: 'CyberTactics.app/Contents/MacOS/CyberTactics',
      win32: 'CyberTactics.exe',
      linux: 'CyberTactics.x86_64'
    },
    features: [
      'Tactical Cover System: Full and half cover with destructible environments',
      'Cyberware Augmentations: Overclock speed, optical camouflage, and neuro-shock',
      'Shared Universe: Set in the same world and syndicate underworld as AetherRush'
    ],
    requirements: {
      os: 'macOS 12+ / Windows 10+ 64-bit / Linux',
      cpu: 'Quad-Core Processor',
      gpu: 'DirectX 11 / Vulkan compatible GPU',
      ram: '8 GB RAM',
      storage: '500 MB free space'
    },
    changelog: [
      {
        version: 'v0.9.1',
        date: 'Oct 1, 2026',
        title: 'Closed Alpha Preview Build',
        changes: [
          'Initial tactical grid movement prototype',
          'Unit class balance: Infiltrator, Heavy, Hacker, Combat Medic'
        ]
      }
    ]
  }
];
export const catalogData = INAAYAH_GAMES_CATALOG;
