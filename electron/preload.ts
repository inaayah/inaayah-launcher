import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherConfig, DownloadProgress, GameStatus, InstalledGame } from '../src/types/launcher';

contextBridge.exposeInMainWorld('inaayahLauncher', {
  isElectron: true,

  getConfig: (): Promise<LauncherConfig> => {
    return ipcRenderer.invoke('launcher:get-config');
  },

  setConfig: (config: Partial<LauncherConfig>): Promise<LauncherConfig> => {
    return ipcRenderer.invoke('launcher:set-config', config);
  },

  browseDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('launcher:browse-directory');
  },

  getInstalledGames: () => {
    return ipcRenderer.invoke('launcher:get-installed-games');
  },

  downloadGame: (gameId: string, targetVersion: string = '1.0.0', downloadUrl?: string): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:download-game', gameId, targetVersion, downloadUrl);
  },

  cancelDownload: (gameId: string): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:cancel-download', gameId);
  },

  uninstallGame: (gameId: string): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:uninstall-game', gameId);
  },

  launchGame: (gameId: string, args: string[] = []): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:launch-game', gameId, args);
  },

  launchWebGame: (gameId: string, url: string): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:launch-web-game', gameId, url);
  },

  openExternalUrl: (url: string): Promise<void> => {
    return ipcRenderer.invoke('launcher:open-external-url', url);
  },

  openFolder: (folderPath: string): Promise<void> => {
    return ipcRenderer.invoke('launcher:open-folder', folderPath);
  },

  checkUpdates: (gameId: string, latestVersion: string): Promise<boolean> => {
    return ipcRenderer.invoke('launcher:check-updates', gameId, latestVersion);
  },

  refreshCatalog: () => {
    return ipcRenderer.invoke('launcher:refresh-catalog');
  },

  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: unknown, data: DownloadProgress) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => {
      ipcRenderer.removeListener('download-progress', handler);
    };
  },

  onInstalledGamesUpdated: (callback: (games: Record<string, InstalledGame>) => void) => {
    const handler = (_event: unknown, games: Record<string, InstalledGame>) => callback(games);
    ipcRenderer.on('launcher:installed-games-updated', handler);
    return () => {
      ipcRenderer.removeListener('launcher:installed-games-updated', handler);
    };
  },

  onGameStatusChanged: (callback: (data: { gameId: string; status: GameStatus; exitCode?: number }) => void) => {
    const handler = (_event: unknown, data: { gameId: string; status: GameStatus; exitCode?: number }) => callback(data);
    ipcRenderer.on('game-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('game-status-changed', handler);
    };
  },

  windowMinimize: () => {
    ipcRenderer.send('window:minimize');
  },

  windowMaximize: () => {
    ipcRenderer.send('window:maximize');
  },

  windowClose: () => {
    ipcRenderer.send('window:close');
  },

  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('launcher:get-app-version');
  },

  checkLauncherUpdate: () => {
    return ipcRenderer.invoke('launcher:check-for-updates');
  },

  restartAndInstallUpdate: () => {
    return ipcRenderer.invoke('launcher:restart-and-install-update');
  },

  onLauncherUpdateReady: (callback: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => callback(version);
    ipcRenderer.on('launcher-update-ready', handler);
    return () => {
      ipcRenderer.removeListener('launcher-update-ready', handler);
    };
  },

  onLauncherUpdateAvailable: (callback: (info: { version: string; releaseUrl: string }) => void) => {
    const handler = (_event: unknown, info: { version: string; releaseUrl: string }) => callback(info);
    ipcRenderer.on('launcher-update-available', handler);
    return () => {
      ipcRenderer.removeListener('launcher-update-available', handler);
    };
  }
});
