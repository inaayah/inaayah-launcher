export type GameStatus =
  | 'NOT_INSTALLED'
  | 'DOWNLOADING'
  | 'EXTRACTING'
  | 'INSTALLED'
  | 'UPDATE_AVAILABLE'
  | 'RUNNING';

export type GameType = 'desktop' | 'web';

export interface GameChangelog {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export interface GameSystemRequirements {
  os: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
}

export interface GameCatalogItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  version: string;
  releaseDate: string;
  description: string;
  genres: string[];
  tags: string[];
  developer: string;
  coverArt: string;
  heroBanner: string;
  screenshots: string[];
  sizeBytes: number;
  sizeFormatted: string;
  githubRepo: string;
  gameType?: GameType;
  webUrl?: string;
  executableNames?: {
    win32: string;
    darwin: string;
    linux: string;
  };
  features: string[];
  requirements: GameSystemRequirements;
  changelog: GameChangelog[];
}

export interface InstalledGame {
  id: string;
  version: string;
  installPath: string;
  installedAt: number;
  lastPlayedAt: number | null;
  totalPlaytimeMinutes: number;
}

export interface DownloadProgress {
  gameId: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  phase: 'DOWNLOADING' | 'VERIFYING' | 'EXTRACTING' | 'COMPLETED' | 'ERROR';
  errorMsg?: string;
}

export interface LauncherConfig {
  libraryPath: string;
  autoUpdate: boolean;
  closeLauncherOnGameStart: boolean;
  nakamaHost: string;
  nakamaPort: number;
  useSSL: boolean;
}

export interface InaayahLauncherAPI {
  isElectron: boolean;
  getConfig: () => Promise<LauncherConfig>;
  setConfig: (config: Partial<LauncherConfig>) => Promise<LauncherConfig>;
  browseDirectory: () => Promise<string | null>;
  getInstalledGames: () => Promise<Record<string, InstalledGame>>;
  downloadGame: (gameId: string, targetVersion?: string, downloadUrl?: string) => Promise<boolean>;
  cancelDownload: (gameId: string) => Promise<boolean>;
  uninstallGame: (gameId: string) => Promise<boolean>;
  launchGame: (gameId: string, args?: string[]) => Promise<boolean>;
  launchWebGame: (gameId: string, url: string) => Promise<boolean>;
  openFolder: (path: string) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  checkUpdates: (gameId: string, latestVersion: string) => Promise<boolean>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onGameStatusChanged: (callback: (data: { gameId: string; status: GameStatus; exitCode?: number }) => void) => () => void;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
}

declare global {
  interface Window {
    inaayahLauncher?: InaayahLauncherAPI;
  }
}
