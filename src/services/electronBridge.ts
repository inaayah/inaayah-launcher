import type { InaayahLauncherAPI, LauncherConfig, InstalledGame, DownloadProgress, GameStatus, GameCatalogItem } from '../types/launcher';

const STORAGE_KEY_CONFIG = 'inaayah_launcher_config_mock';
const STORAGE_KEY_INSTALLED = 'inaayah_launcher_installed_mock';

const defaultFallbackConfig: LauncherConfig = {
  libraryPath: '~/InaayahGames',
  autoUpdate: true,
  closeLauncherOnGameStart: false,
  nakamaHost: '94.130.227.190',
  nakamaPort: 7350,
  useSSL: false
};

// Listeners for mock mode
const mockDownloadListeners = new Set<(progress: DownloadProgress) => void>();
const mockStatusListeners = new Set<(data: { gameId: string; status: GameStatus; exitCode?: number }) => void>();
const activeMockIntervals = new Map<string, number>();

function getMockConfig(): LauncherConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) return { ...defaultFallbackConfig, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return defaultFallbackConfig;
}

function setMockConfig(cfg: Partial<LauncherConfig>): LauncherConfig {
  const current = getMockConfig();
  const next = { ...current, ...cfg };
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

function getMockInstalled(): Record<string, InstalledGame> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INSTALLED);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  // Default mock: AetherRush is already installed locally in dev!
  const initial: Record<string, InstalledGame> = {
    'aether-rush': {
      id: 'aether-rush',
      version: '1.2.0',
      installPath: '/Users/sazid/Repositories/aether-rush/godot',
      installedAt: Date.now() - 86400000 * 2,
      lastPlayedAt: Date.now() - 3600000,
      totalPlaytimeMinutes: 142
    }
  };
  return initial;
}

function saveMockInstalled(games: Record<string, InstalledGame>) {
  try {
    localStorage.setItem(STORAGE_KEY_INSTALLED, JSON.stringify(games));
  } catch {
    // ignore
  }
}

export const launcherBridge: InaayahLauncherAPI = {
  get isElectron(): boolean {
    return Boolean(window.inaayahLauncher?.isElectron);
  },

  async getConfig(): Promise<LauncherConfig> {
    if (window.inaayahLauncher) return window.inaayahLauncher.getConfig();
    return getMockConfig();
  },

  async setConfig(config: Partial<LauncherConfig>): Promise<LauncherConfig> {
    if (window.inaayahLauncher) return window.inaayahLauncher.setConfig(config);
    return setMockConfig(config);
  },

  async browseDirectory(): Promise<string | null> {
    if (window.inaayahLauncher) return window.inaayahLauncher.browseDirectory();
    return '/Users/sazid/InaayahGames';
  },

  async getInstalledGames(): Promise<Record<string, InstalledGame>> {
    if (window.inaayahLauncher) return window.inaayahLauncher.getInstalledGames();
    return getMockInstalled();
  },

  async downloadGame(gameId: string, targetVersion: string = '1.0.0', downloadUrl?: string): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.downloadGame(gameId, targetVersion, downloadUrl);

    // Mock download simulation
    const totalBytes = 450 * 1024 * 1024;
    let received = 0;
    const speed = 24.5 * 1024 * 1024; // 24.5 MB/s

    if (activeMockIntervals.has(gameId)) {
      clearInterval(activeMockIntervals.get(gameId));
    }

    return new Promise((resolve) => {
      const interval = window.setInterval(() => {
        received += speed / 5;
        if (received >= totalBytes) {
          received = totalBytes;
          clearInterval(interval);
          activeMockIntervals.delete(gameId);

          // notify extracting
          mockDownloadListeners.forEach((fn) =>
            fn({
              gameId,
              bytesReceived: totalBytes,
              totalBytes,
              percentage: 100,
              speedBytesPerSec: 0,
              etaSeconds: 0,
              phase: 'EXTRACTING'
            })
          );

          setTimeout(() => {
            const installed = getMockInstalled();
            installed[gameId] = {
              id: gameId,
              version: targetVersion,
              installPath: `/Users/sazid/InaayahGames/${gameId}`,
              installedAt: Date.now(),
              lastPlayedAt: null,
              totalPlaytimeMinutes: 0
            };
            saveMockInstalled(installed);

            mockDownloadListeners.forEach((fn) =>
              fn({
                gameId,
                bytesReceived: totalBytes,
                totalBytes,
                percentage: 100,
                speedBytesPerSec: 0,
                etaSeconds: 0,
                phase: 'COMPLETED'
              })
            );

            mockStatusListeners.forEach((fn) =>
              fn({ gameId, status: 'INSTALLED' })
            );

            resolve(true);
          }, 800);
          return;
        }

        const percentage = Math.round((received / totalBytes) * 100);
        const etaSeconds = Math.max(1, Math.round((totalBytes - received) / speed));

        mockDownloadListeners.forEach((fn) =>
          fn({
            gameId,
            bytesReceived: received,
            totalBytes,
            percentage,
            speedBytesPerSec: speed + (Math.random() * 2000000 - 1000000),
            etaSeconds,
            phase: 'DOWNLOADING'
          })
        );
      }, 200);

      activeMockIntervals.set(gameId, interval);
    });
  },

  async cancelDownload(gameId: string): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.cancelDownload(gameId);
    if (activeMockIntervals.has(gameId)) {
      clearInterval(activeMockIntervals.get(gameId));
      activeMockIntervals.delete(gameId);
    }
    mockStatusListeners.forEach((fn) => fn({ gameId, status: 'NOT_INSTALLED' }));
    return true;
  },

  async uninstallGame(gameId: string): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.uninstallGame(gameId);
    const installed = getMockInstalled();
    delete installed[gameId];
    saveMockInstalled(installed);
    mockStatusListeners.forEach((fn) => fn({ gameId, status: 'NOT_INSTALLED' }));
    return true;
  },

  async launchGame(gameId: string, args?: string[]): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.launchGame(gameId, args);

    mockStatusListeners.forEach((fn) => fn({ gameId, status: 'RUNNING' }));

    setTimeout(() => {
      const installed = getMockInstalled();
      if (installed[gameId]) {
        installed[gameId].lastPlayedAt = Date.now();
        installed[gameId].totalPlaytimeMinutes += 12;
        saveMockInstalled(installed);
      }
      mockStatusListeners.forEach((fn) => fn({ gameId, status: 'INSTALLED', exitCode: 0 }));
    }, 6000);

    return true;
  },

  async launchWebGame(gameId: string, url: string): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.launchWebGame(gameId, url);

    window.open(url, '_blank');
    mockStatusListeners.forEach((fn) => fn({ gameId, status: 'RUNNING' }));

    setTimeout(() => {
      const installed = getMockInstalled();
      installed[gameId] = installed[gameId] || {
        id: gameId,
        version: '1.0.0',
        installPath: url,
        installedAt: Date.now(),
        lastPlayedAt: Date.now(),
        totalPlaytimeMinutes: 0
      };
      installed[gameId].lastPlayedAt = Date.now();
      installed[gameId].totalPlaytimeMinutes += 10;
      saveMockInstalled(installed);
      mockStatusListeners.forEach((fn) => fn({ gameId, status: 'INSTALLED', exitCode: 0 }));
    }, 5000);

    return true;
  },

  async openExternalUrl(url: string): Promise<void> {
    if (window.inaayahLauncher) return window.inaayahLauncher.openExternalUrl(url);
    window.open(url, '_blank');
  },

  async openFolder(folderPath: string): Promise<void> {
    if (window.inaayahLauncher) return window.inaayahLauncher.openFolder(folderPath);
    console.log('[Mock Browser] Open folder:', folderPath);
  },

  async refreshCatalog(): Promise<GameCatalogItem[]> {
    if (window.inaayahLauncher) return window.inaayahLauncher.refreshCatalog();
    return [];
  },

  async checkUpdates(gameId: string, latestVersion: string): Promise<boolean> {
    if (window.inaayahLauncher) return window.inaayahLauncher.checkUpdates(gameId, latestVersion);
    const installed = getMockInstalled();
    const current = installed[gameId];
    return current ? current.version !== latestVersion : false;
  },

  onDownloadProgress(callback: (progress: DownloadProgress) => void) {
    if (window.inaayahLauncher) return window.inaayahLauncher.onDownloadProgress(callback);
    mockDownloadListeners.add(callback);
    return () => {
      mockDownloadListeners.delete(callback);
    };
  },

  onGameStatusChanged(callback: (data: { gameId: string; status: GameStatus; exitCode?: number }) => void) {
    if (window.inaayahLauncher) return window.inaayahLauncher.onGameStatusChanged(callback);
    mockStatusListeners.add(callback);
    return () => {
      mockStatusListeners.delete(callback);
    };
  },

  windowMinimize() {
    if (window.inaayahLauncher) window.inaayahLauncher.windowMinimize();
  },

  windowMaximize() {
    if (window.inaayahLauncher) window.inaayahLauncher.windowMaximize();
  },

  windowClose() {
    if (window.inaayahLauncher) window.inaayahLauncher.windowClose();
  },

  async restartAndInstallUpdate(): Promise<void> {
    if (window.inaayahLauncher?.restartAndInstallUpdate) {
      await window.inaayahLauncher.restartAndInstallUpdate();
    }
  },

  onLauncherUpdateReady(callback: (version: string) => void) {
    if (window.inaayahLauncher?.onLauncherUpdateReady) {
      return window.inaayahLauncher.onLauncherUpdateReady(callback);
    }
    return () => {};
  }
};
