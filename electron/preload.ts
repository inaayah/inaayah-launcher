import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherConfig, DownloadProgress, GameStatus } from '../src/types/launcher';

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
  }
});
