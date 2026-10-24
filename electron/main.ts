import { assertNotOlderInstall, newerGameVersion, retainNewerCatalog, GameDowngradeError } from './game-version';
import { app, BrowserWindow, ipcMain, dialog, shell, session, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { spawn, exec, execFile, ChildProcess } from 'child_process';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { validateRecipe, installIncremental, commitInstall, recoverInterruptedInstalls } from './incremental-update';
import { autoUpdater } from 'electron-updater';
import { macUpdatePaths, stagedAppMatchesVersion, macInstallScript, applyMacPatchToStagedBundle } from './mac-update-state';
import { localDevRoots, findLocalGodotProject, discoverLocalGodotProjects, localDevLaunch } from './local-dev';

interface LauncherConfig {
  libraryPath: string;
  autoUpdate: boolean;
  closeLauncherOnGameStart: boolean;
  nakamaHost: string;
  nakamaPort: number;
  useSSL: boolean;
  releaseGatewayUrl?: string;
  githubToken?: string;
}

interface InstalledGameMeta {
  id: string;
  version: string;
  installPath: string;
  installedAt: number;
  lastPlayedAt: number | null;
  totalPlaytimeMinutes: number;
}

let mainWindow: BrowserWindow | null = null;
const runningProcesses = new Map<string, { proc: ChildProcess; startTime: number }>();
const activeDownloads = new Map<string, { abort: () => void; done: Promise<void> }>();


// --- Cached & Background Asynchronous Discovery Helpers ---

function devSearchRoots(): string[] {
  return localDevRoots(app.getPath('home'), app.getAppPath(), process.cwd());
}

function findLocalDevGodotProject(gameId: string): string | null {
  // Recheck on refresh: a repo can be linked, moved or removed while the launcher is open.
  return findLocalGodotProject(gameId, devSearchRoots());
}

let cachedGodotBinary: string | null | undefined = undefined;
let godotProbePromise: Promise<string | null> | null = null;

// Background non-blocking Godot binary discovery
async function resolveGodotBinaryAsync(): Promise<string | null> {
  if (cachedGodotBinary !== undefined) return cachedGodotBinary;
  if (godotProbePromise) return godotProbePromise;

  godotProbePromise = new Promise<string | null>((resolve) => {
    const home = app.getPath('home');
    const directCandidates = [
      // macOS
      path.join(home, '.local/bin/godot'),
      '/Applications/Godot.app/Contents/MacOS/Godot',
      '/opt/homebrew/bin/godot',
      '/usr/local/bin/godot',
      // Windows
      'C:\\Program Files\\Godot\\Godot.exe',
      'C:\\Program Files (x86)\\Godot\\Godot.exe',
      path.join(home, 'AppData\\Local\\Programs\\Godot\\Godot.exe'),
      path.join(home, 'scoop\\apps\\godot\\current\\godot.exe'),
      path.join(home, '.local\\bin\\godot.exe'),
      'C:\\Godot\\Godot.exe',
      // Linux
      '/usr/bin/godot',
      '/usr/local/bin/godot'
    ];

    for (const bin of directCandidates) {
      try {
        if (fs.existsSync(bin)) {
          cachedGodotBinary = bin;
          godotProbePromise = null;
          return resolve(bin);
        }
      } catch {}
    }

    // Fallback: asynchronous non-blocking PATH search (exec with callback, never execSync!)
    const cmd = process.platform === 'win32' ? 'where godot 2>nul' : 'which godot 2>/dev/null';
    exec(cmd, { timeout: 2500 }, (err, stdout) => {
      godotProbePromise = null;
      if (!err && stdout && stdout.trim()) {
        const bin = stdout.trim().split(/\r?\n/)[0];
        cachedGodotBinary = bin;
        resolve(bin);
      } else {
        cachedGodotBinary = null;
        resolve(null);
      }
    });
  });

  return godotProbePromise;
}

function findGodotBinary(): string | null {
  if (cachedGodotBinary !== undefined) return cachedGodotBinary;
  // Trigger background probe asynchronously without blocking
  resolveGodotBinaryAsync().catch(() => {});
  return null;
}

async function findGameExecutable(gameDir: string): Promise<string | null> {
  if (!fs.existsSync(gameDir)) return null;
  const platform = process.platform;

  // Fast O(1) checks for known binaries to avoid deep directory traversal
  if (platform === 'darwin') {
    if (fs.existsSync(path.join(gameDir, 'AetherRush 2.5D Arcade.app'))) return path.join(gameDir, 'AetherRush 2.5D Arcade.app');
    if (fs.existsSync(path.join(gameDir, 'AetherRush.app'))) return path.join(gameDir, 'AetherRush.app');
    if (fs.existsSync(path.join(gameDir, 'launch.sh'))) return path.join(gameDir, 'launch.sh');
  } else if (platform === 'win32') {
    if (fs.existsSync(path.join(gameDir, 'AetherRush.exe'))) return path.join(gameDir, 'AetherRush.exe');
    if (fs.existsSync(path.join(gameDir, 'launch.bat'))) return path.join(gameDir, 'launch.bat');
  } else {
    if (fs.existsSync(path.join(gameDir, 'AetherRush.x86_64'))) return path.join(gameDir, 'AetherRush.x86_64');
    if (fs.existsSync(path.join(gameDir, 'launch.sh'))) return path.join(gameDir, 'launch.sh');
  }

  // Asynchronous directory scan yielding to the event loop
  try {
    const entries = await fs.promises.readdir(gameDir, { withFileTypes: true });
    if (platform === 'darwin') {
      const appBundle = entries.find(e => e.isDirectory() && e.name.endsWith('.app'));
      if (appBundle) return path.join(gameDir, appBundle.name);
    } else if (platform === 'win32') {
      const exe = entries.find(e => !e.isDirectory() && e.name.toLowerCase().endsWith('.exe'));
      if (exe) return path.join(gameDir, exe.name);
    } else {
      const bin = entries.find(e => !e.isDirectory() && (e.name.endsWith('.x86_64') || e.name.endsWith('.x86')));
      if (bin) return path.join(gameDir, bin.name);
    }

    // Check 1 subfolder level deep asynchronously
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.endsWith('.app') && entry.name !== 'node_modules') {
        const subDir = path.join(gameDir, entry.name);
        const subEntries = await fs.promises.readdir(subDir, { withFileTypes: true }).catch(() => []);
        if (platform === 'darwin') {
          const appB = subEntries.find(e => e.isDirectory() && e.name.endsWith('.app'));
          if (appB) return path.join(subDir, appB.name);
        } else if (platform === 'win32') {
          const exeB = subEntries.find(e => !e.isDirectory() && e.name.toLowerCase().endsWith('.exe'));
          if (exeB) return path.join(subDir, exeB.name);
        } else {
          const binB = subEntries.find(e => !e.isDirectory() && e.name.endsWith('.x86_64'));
          if (binB) return path.join(subDir, binB.name);
        }
      }
    }
  } catch {}

  return null;
}

function getDefaultLibraryPath(): string {
  const home = app.getPath('home');
  return path.join(home, 'InaayahGames');
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'launcher_config.json');
}

function loadConfig(): LauncherConfig {
  const cfgPath = getConfigPath();
  const defaultConfig: LauncherConfig = {
    libraryPath: getDefaultLibraryPath(),
    autoUpdate: true,
    closeLauncherOnGameStart: false,
    nakamaHost: '94.130.227.190',
    nakamaPort: 7350,
    useSSL: false,
    releaseGatewayUrl: 'https://releases.inaayah.dev'
  };

  try {
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Failed to load launcher config:', err);
  }

  return defaultConfig;
}

function saveConfig(cfg: Partial<LauncherConfig>): LauncherConfig {
  const current = loadConfig();
  const updated = { ...current, ...cfg };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save launcher config:', err);
  }
  return updated;
}

// Background asynchronous game library scanner & cache
let cachedInstalledGames: Record<string, InstalledGameMeta> = {};
let installedScan: Promise<Record<string, InstalledGameMeta>> | null = null;
let initialScanPromise: Promise<Record<string, InstalledGameMeta>> | null = null;
const uninstalledDevGames = new Set<string>();

async function scanInstalledGames(libraryPath?: string, forceFresh = false): Promise<Record<string, InstalledGameMeta>> {
  if (installedScan) {
    await installedScan;
    return forceFresh ? scanInstalledGames(libraryPath, true) : cachedInstalledGames;
  }
  const pending = performInstalledScan(libraryPath);
  installedScan = pending;
  try { return await pending; }
  finally { if (installedScan === pending) installedScan = null; }
}

async function performInstalledScan(libraryPath?: string): Promise<Record<string, InstalledGameMeta>> {
  try {
    const libPath = libraryPath || loadConfig().libraryPath;
    const installed: Record<string, InstalledGameMeta> = {};
    await recoverInterruptedInstalls(libPath);

    // Local projects are fallbacks; a valid downloaded release below takes precedence.
    const godotBin = await resolveGodotBinaryAsync();
    const localProjects = await discoverLocalGodotProjects(devSearchRoots());

    for (const [gId, localDevRepo] of localProjects) {
      if (uninstalledDevGames.has(gId)) continue;
      if (godotBin) {
        installed[gId] = {
          id: gId,
          version: '0.1.0 (Local Dev)',
          installPath: localDevRepo,
          installedAt: Date.now() - 86400000 * 2,
          lastPlayedAt: Date.now() - 3600000 * 2,
          totalPlaytimeMinutes: 45
        };
      }
    }

    if (fs.existsSync(libPath)) {
      const entries = await fs.promises.readdir(libPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const gameDir = path.join(libPath, entry.name);
          const manifestPath = path.join(gameDir, 'manifest.json');
          if (!fs.existsSync(manifestPath)) continue;

          let meta: any = null;
          try {
            const rawManifest = await fs.promises.readFile(manifestPath, 'utf-8');
            meta = JSON.parse(rawManifest);
          } catch (e) {
            console.error(`Invalid manifest for game ${entry.name}:`, e);
            continue;
          }

          const isWebGame = meta?.installPath && typeof meta.installPath === 'string' && meta.installPath.startsWith('http');

          if (!isWebGame) {
            const execPath = await findGameExecutable(gameDir);
            const isStaleMock = execPath && (execPath.endsWith('.sh') || execPath.endsWith('.bat') || execPath.endsWith('.cmd'));

            if (!execPath || isStaleMock) {
              if (!uninstalledDevGames.has(entry.name)) {
                const devRepo = findLocalDevGodotProject(entry.name);
                const godotBin = await resolveGodotBinaryAsync();
                if (devRepo && godotBin) {
                  installed[entry.name] = {
                    id: entry.name,
                    version: '1.2.0 (Local Dev)',
                    installPath: devRepo,
                    installedAt: Date.now() - 86400000,
                    lastPlayedAt: Date.now() - 3600000,
                    totalPlaytimeMinutes: 45
                  };
                  continue;
                }
              }
            }

            // CRITICAL: A native desktop game MUST have an existing executable on disk to be installed!
            if (!execPath || !fs.existsSync(execPath)) {
              console.log(`[Launcher] Game "${entry.name}" has manifest but executable is missing on disk. Marked as not installed.`);
              continue;
            }
          }

          installed[entry.name] = {
            id: entry.name,
            version: meta?.version || '1.0.0',
            installPath: isWebGame ? meta.installPath : gameDir,
            installedAt: meta?.installedAt || Date.now(),
            lastPlayedAt: meta?.lastPlayedAt || null,
            totalPlaytimeMinutes: meta?.totalPlaytimeMinutes || 0
          };
        }
      }
    }

    // Detect games that disappeared from disk and notify frontend
    const previousIds = Object.keys(cachedInstalledGames);
    for (const prevId of previousIds) {
      if (!installed[prevId]) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-status-changed', { gameId: prevId, status: 'NOT_INSTALLED' });
        }
      }
    }

    cachedInstalledGames = installed;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launcher:installed-games-updated', installed);
    }

    return installed;
  } catch (err) {
    console.error('Background game scan error:', err);
    return cachedInstalledGames;
  }
}

function createWindow(): void {
  const iconPath = path.join(app.getAppPath(), 'build/icon.png');
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch {}
  }

  mainWindow = new BrowserWindow({
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0e14',
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    mainWindow.loadURL(devUrl).catch(() => {
      setTimeout(() => mainWindow?.loadURL(devUrl), 500);
    });

    // Developer keyboard shortcuts (F12: DevTools, Cmd+R/Ctrl+R/F5: Reload)
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || ((input.meta || input.control) && input.alt && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
      if (input.key === 'F5' || ((input.meta || input.control) && input.key.toLowerCase() === 'r')) {
        mainWindow?.webContents.reloadIgnoringCache();
        event.preventDefault();
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Rescan installed games whenever the user returns focus to the launcher
  mainWindow.on('focus', () => {
    scanInstalledGames().catch(() => {});
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure library path exists
app.whenReady().then(() => {
  const cfg = loadConfig();
  if (!fs.existsSync(cfg.libraryPath)) {
    try {
      fs.mkdirSync(cfg.libraryPath, { recursive: true });
    } catch (e) {
      console.error('Failed to create default library directory:', e);
    }
  }

  // Live filesystem watcher to immediately detect external game deletions or file changes
  let scanDebounceTimer: NodeJS.Timeout | null = null;
  const triggerDebouncedScan = () => {
    if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      scanInstalledGames().catch(() => {});
    }, 300);
  };

  if (fs.existsSync(cfg.libraryPath)) {
    try {
      fs.watch(cfg.libraryPath, { recursive: false }, () => {
        triggerDebouncedScan();
      });
    } catch (e) {
      console.warn('Library folder watcher warning:', e);
    }
  }

  // Automatic fallback for image assets in file:// mode
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['file://*'] }, (details, callback) => {
    try {
      const url = details.url;
      const imgMatch = url.match(/[/\\]([^/\\]+\.(?:jpg|jpeg|png|webp|svg|ico))$/i);
      if (imgMatch) {
        const filename = imgMatch[1];
        if (filename === 'icon.png' && !url.includes('/dist/icon.png')) {
          const target = path.join(__dirname, '../dist/icon.png');
          if (fs.existsSync(target)) {
            return callback({ redirectURL: `file://${target}` });
          }
        }
        if (!url.includes('/dist/images/')) {
          const target = path.join(__dirname, '../dist/images', filename);
          if (fs.existsSync(target)) {
            return callback({ redirectURL: `file://${target}` });
          }
        }
      }
    } catch {}
    callback({});
  });

  // Trigger background scanning & binary search immediately without blocking the UI
  initialScanPromise = scanInstalledGames(cfg.libraryPath);
  resolveGodotBinaryAsync().catch(() => {});

  createWindow();

  setTimeout(async () => {
    try {
      const info = await fetchLatestLauncherRelease();
      if (info.isNewer) {
        mainWindow?.webContents.send('launcher-update-available', {
          version: info.latestTag,
          releaseUrl: info.releaseUrl
        });
        if (Notification.isSupported()) {
          new Notification({
            title: 'Inaayah Launcher Update Available',
            body: `Version v${info.latestTag} is now available!`
          }).show();
        }
        if (process.platform === 'darwin' && app.isPackaged) {
          downloadMacUpdateInBackground(info.latestTag, cfg).catch(() => {});
        }
      }
    } catch (e: any) {
      console.warn('[AutoUpdater] Startup update check warning:', e.message);
    }

    // Background in-place autoUpdater only works on Windows and Linux without Apple Developer ID
    if (app.isPackaged && process.platform !== 'darwin') {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[AutoUpdater] checkForUpdatesAndNotify warning:', err.message);
      });
    }
  }, 2500);

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('launcher-update-ready', info.version);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Inaayah Launcher Update Ready',
        body: `Version v${info.version} is downloaded. Restart to apply.`
      }).show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Communication Handlers ---

function sanitizeCatalog(data: any[]): any[] {
  if (!Array.isArray(data)) return [];
  const mapUrl = (url: any): string => {
    if (typeof url !== 'string' || !url) return '';
    if (url.includes('raw.githubusercontent.com') || url.startsWith('./images/') || url.startsWith('images/')) {
      const fn = url.split('/').pop()?.split('?')[0];
      return `https://inaayah.dev/images/${fn}`;
    }
    return url;
  };

  return data.map((game) => {
    const coverArt = mapUrl(game.coverArt);
    const heroBanner = mapUrl(game.heroBanner);
    const screenshots = Array.isArray(game.screenshots)
      ? game.screenshots.map(mapUrl)
      : [];
    const isComingSoon = game.id === 'sundered-depths' || game.id === 'cyber-tactics' || Boolean(game.isComingSoon);
    return { ...game, coverArt, heroBanner, screenshots, isComingSoon };
  });
}

function mergeLocalSiblingManifests(catalog: any[], catalogDir: string): any[] {
  return catalog.map((item) => {
    if (!item?.id || item.isComingSoon) return item;
    const repoName = typeof item.githubRepo === 'string' ? item.githubRepo.replace(/^[^/]+\//, '') : item.id;
    const candidateManifestPaths = [
      path.resolve(catalogDir, '..', repoName, 'game-manifest.json'),
      path.resolve(catalogDir, '..', item.id, 'game-manifest.json')
    ];
    for (const manifestPath of candidateManifestPaths) {
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest && manifest.id === item.id) {
            return { ...item, ...manifest };
          }
        } catch {}
      }
    }
    return item;
  });
}

function catalogWithKnownVersions(data: any[]): any[] {
  let previous: any[] = [];
  try { previous = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'catalog_cache.json'), 'utf8')); } catch {}
  return retainNewerCatalog(sanitizeCatalog(data), Array.isArray(previous) ? previous : []);
}

ipcMain.handle('launcher:refresh-catalog', async () => {
  const cfg = loadConfig();
  const cacheFile = path.join(app.getPath('userData'), 'catalog_cache.json');

  // Trigger background scan of installed games to re-validate disk status
  scanInstalledGames().catch(() => {});

  // 0. Seed local games-catalog.json + sibling game-manifest.json files in local dev so retainNewerCatalog has latest local state
  let localDevCatalog: any[] | null = null;
  if (!app.isPackaged) {
    const localCandidates = [
      path.resolve(process.cwd(), 'games-catalog.json'),
      path.resolve(__dirname, '../../games-catalog.json')
    ];
    for (const p of localCandidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (Array.isArray(raw) && raw.length > 0) {
            const mergedLocal = mergeLocalSiblingManifests(raw, path.dirname(p));
            localDevCatalog = catalogWithKnownVersions(mergedLocal);
            fs.writeFileSync(cacheFile, JSON.stringify(localDevCatalog, null, 2));
            break;
          }
        } catch {}
      }
    }
  }

  if (cfg.releaseGatewayUrl) {
    try {
      const fetchUrl = `${cfg.releaseGatewayUrl.replace(/\/$/, '')}/api/games?t=${Date.now()}`;
      const res = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'InaayahLauncher', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const merged = !app.isPackaged ? mergeLocalSiblingManifests(data, process.cwd()) : data;
          const sanitized = catalogWithKnownVersions(merged);
          fs.writeFileSync(cacheFile, JSON.stringify(sanitized, null, 2));
          return sanitized;
        }
      }
    } catch (e) {
      console.log('[Catalog] Remote gateway unreachable or not configured. Using direct manifests and local cache.');
    }
  }

  if (localDevCatalog) {
    return localDevCatalog;
  }

  // 2. Direct GitHub raw manifest fallback (fetches games-catalog.json directly from public repo)
  try {
    const rawCatalogUrl = `https://raw.githubusercontent.com/inaayah/inaayah-launcher/main/games-catalog.json?t=${Date.now()}`;
    const res = await fetch(rawCatalogUrl, {
      headers: { 'User-Agent': 'InaayahLauncher', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sanitized = catalogWithKnownVersions(data);
        fs.writeFileSync(cacheFile, JSON.stringify(sanitized, null, 2));
        return sanitized;
      }
    }
  } catch (e) {
    console.log('[Catalog] Direct GitHub manifest fetch failed. Checking local disk cache...');
  }

  if (fs.existsSync(cacheFile)) {
    try {
      return sanitizeCatalog(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')));
    } catch {}
  }

  // 4. Offline fallback to bundled games-catalog.json
  try {
    const bundledPath = path.join(app.getAppPath(), 'games-catalog.json');
    if (fs.existsSync(bundledPath)) {
      return sanitizeCatalog(JSON.parse(fs.readFileSync(bundledPath, 'utf-8')));
    }
  } catch {}

  return [];
});

ipcMain.handle('launcher:get-config', async () => {
  return loadConfig();
});

ipcMain.handle('launcher:set-config', async (_event, cfg: Partial<LauncherConfig>) => {
  return saveConfig(cfg);
});

ipcMain.handle('launcher:browse-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Game Library Folder'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('launcher:get-installed-games', async () => {
  return scanInstalledGames();
});

ipcMain.handle('launcher:open-folder', async (_event, folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
  }
});

ipcMain.handle('launcher:cancel-download', async (_event, gameId: string) => {
  const active = activeDownloads.get(gameId);
  if (active) {
    active.abort();
    return true;
  }
  return false;
});

ipcMain.handle('launcher:uninstall-game', async (_event, gameId: string) => {
  uninstalledDevGames.add(gameId);
  const download = activeDownloads.get(gameId);
  if (download) { download.abort(); await download.done; }

  if (runningProcesses.has(gameId)) {
    try {
      runningProcesses.get(gameId)?.proc?.kill();
    } catch {}
    runningProcesses.delete(gameId);
  }

  delete cachedInstalledGames[gameId];

  const cfg = loadConfig();
  const gameDir = path.join(cfg.libraryPath, gameId);
  let removed = true;
  if (fs.existsSync(gameDir)) {
    try {
      fs.rmSync(gameDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to delete game directory ${gameDir}:`, e);
      removed = false;
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game-status-changed', { gameId, status: 'NOT_INSTALLED' });
    mainWindow.webContents.send('launcher:installed-games-updated', cachedInstalledGames);
  }

  await scanInstalledGames();
  return removed;
});

ipcMain.handle('launcher:check-updates', async (_event, gameId: string, latestVersion: string) => {
  const cfg = loadConfig();
  const gameDir = path.join(cfg.libraryPath, gameId);
  const manifestPath = path.join(gameDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return newerGameVersion(latestVersion, meta.version);
    } catch (e) {
      return false;
    }
  }
  return false;
});

ipcMain.handle('launcher:download-game', async (_event, gameId: string, targetVersion: string, downloadUrl?: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId) || !/^\d+\.\d+\.\d+$/.test(targetVersion)) return false;
  if (activeDownloads.has(gameId) || runningProcesses.has(gameId)) return false;
  const cfg = loadConfig();
  const gameDir = path.join(cfg.libraryPath, gameId);
  const controller = new AbortController();
  const signal = controller.signal;
  let finishDownload!: () => void;
  const done = new Promise<void>(resolve => { finishDownload = resolve; });
  activeDownloads.set(gameId, { abort: () => controller.abort(), done });
  let progressPhase = '', phaseStarted = Date.now();
  const sendProgress = (phase: string, received = 0, total = 0, errorMsg?: string) => {
    if (phase !== progressPhase) { progressPhase = phase; phaseStarted = Date.now(); }
    const speed = phase === 'DOWNLOADING' ? received / Math.max((Date.now() - phaseStarted) / 1000, 0.1) : 0;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('download-progress', { gameId, phase, bytesReceived: received, totalBytes: total,
      percentage: total ? Math.round(received / total * 100) : 0, speedBytesPerSec: speed, etaSeconds: speed && total ? Math.max(0, Math.ceil((total - received) / speed)) : 0, errorMsg });
  };
  const gateway = (cfg.releaseGatewayUrl || 'https://releases.inaayah.dev').replace(/\/$/, '');
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
  const assetUrl = (name: string) => `${gateway}/api/games/${gameId}/assets/${targetVersion}/${encodeURIComponent(name)}`;
  let temporary: string | undefined;
  try {
    await assertNotOlderInstall(gameDir, targetVersion);
    await fs.promises.mkdir(cfg.libraryPath, { recursive: true });
    sendProgress('CONNECTING');
    const res = await fetch(`${gateway}/api/games/${gameId}/manifest`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!res.ok) throw new Error('Game release information is unavailable. Please retry.');
    const release = await res.json();
    if (release.id !== gameId || release.version !== targetVersion) throw new Error('The available release changed. Refresh the library and retry.');
    const archive = release.downloads?.[platform];
    let previous: Record<string, any> = {};
    try { previous = JSON.parse(await fs.promises.readFile(path.join(gameDir, 'manifest.json'), 'utf8')); } catch {}
    const metadata = { ...previous, id: gameId, version: targetVersion, installedAt: previous.installedAt || Date.now(),
      totalPlaytimeMinutes: previous.totalPlaytimeMinutes || 0, lastPlayedAt: previous.lastPlayedAt || null };
    const incremental = release.incremental?.[platform];
    if (!downloadUrl && incremental && archive?.sizeBytes && fs.existsSync(gameDir)) {
      try {
        if (!/^[a-f0-9]{64}$/.test(incremental.sha256) || incremental.sizeBytes > 16 * 1024 ** 2) throw new Error('Invalid patch metadata');
        const response = await fetch(assetUrl(incremental.manifest), { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
        if (!response.ok) throw new Error('Patch metadata unavailable');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== incremental.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== incremental.sha256) throw new Error('Patch manifest verification failed');
        const recipe = validateRecipe(JSON.parse(bytes.toString('utf8')), gameId, targetVersion, platform);
        if (recipe.dataAsset !== incremental.data || recipe.dataSize !== incremental.dataSize) throw new Error('Patch payload does not match release');
        const result = await installIncremental({ recipe, gameDir, fullSize: archive.sizeBytes, signal, metadata,
          progress: (phase, received, total) => sendProgress(phase, received, total),
          range: async (start, end, total) => {
            const response = await fetch(assetUrl(recipe.dataAsset), { headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' }, signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
            if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${total}`) {
              await response.body?.cancel();
              throw new Error('Server does not support patch ranges');
            }
            return Buffer.from(await response.arrayBuffer());
          }
        });
        if (result) {
          console.log(`[Updater] ${gameId}: downloaded ${result.downloadedBytes} patch bytes; reused ${result.reusedBytes} installed bytes`);
          uninstalledDevGames.delete(gameId);
          await scanInstalledGames(undefined, true);
          sendProgress('COMPLETED', result.downloadedBytes, result.downloadedBytes);
          mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED' });
          return true;
        }
      } catch (error: any) {
        signal.throwIfAborted();
        if (error instanceof GameDowngradeError) throw error;
        console.warn(`[Updater] Incremental update unavailable; using full package: ${error.message}`);
      }
    }
    signal.throwIfAborted();
    temporary = await fs.promises.mkdtemp(path.join(cfg.libraryPath, '.inaayah-download-'));
    const zipPath = path.join(temporary, 'package.zip');
    const stage = path.join(temporary, 'content');
    // Older games can continue using their normal platform download endpoint.
    const url = downloadUrl || (archive?.name ? assetUrl(archive.name) : `${gateway}/api/games/${gameId}/download/${platform}`);
    const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'InaayahLauncher' }, signal });
    if (!response.ok || !response.body) throw new Error(`Game download failed (HTTP ${response.status})`);
    const total = archive?.sizeBytes || Number(response.headers.get('content-length')) || 0;
    const digest = createHash('sha256');
    let received = 0, lastReport = 0;
    const stream = Readable.fromWeb(response.body as any);
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length; digest.update(chunk);
      if (Date.now() - lastReport > 200) { lastReport = Date.now(); sendProgress('DOWNLOADING', received, total); }
    });
    await pipeline(stream, fs.createWriteStream(zipPath), { signal });
    sendProgress('VERIFYING', received, total);
    const checksum = digest.digest('hex');
    if (archive && (received !== archive.sizeBytes || checksum !== archive.sha256)) throw new Error('Downloaded game verification failed. Your existing installation is unchanged.');
    signal.throwIfAborted();
    const zip = new AdmZip(zipPath);
    // extractAllTo validates each entry's CRC; AdmZip 0.5.16's test() helper rejects valid archives.
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\/$/, '');
      if (!name || name.startsWith('/') || /[\\:\x00-\x1f]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid game archive path');
    }
    sendProgress('EXTRACTING', received, total);
    await fs.promises.mkdir(stage);
    zip.extractAllTo(stage, true, process.platform !== 'win32');
    if (!await findGameExecutable(stage)) throw new Error('Game package has no executable');
    await fs.promises.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(metadata, null, 2));
    await commitInstall(stage, gameDir, signal);
    uninstalledDevGames.delete(gameId);
    await scanInstalledGames(undefined, true);
    sendProgress('COMPLETED', received, total);
    mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED' });
    return true;
  } catch (error: any) {
    sendProgress('ERROR', 0, 0, signal.aborted ? 'Download cancelled' : error.message);
    return false;
  } finally {
    activeDownloads.delete(gameId);
    if (temporary) await fs.promises.rm(temporary, { recursive: true, force: true }).catch(() => {});
    finishDownload();
  }
});

ipcMain.handle('launcher:launch-game', async (_event, gameId: string, customArgs: string[] = []) => {
  if (activeDownloads.has(gameId)) return false;
  const cfg = loadConfig();
  const gameDir = path.join(cfg.libraryPath, gameId);

  // If already running, focus
  if (runningProcesses.has(gameId)) {
    return true;
  }

  // Look for executable
  let execPath = await findGameExecutable(gameDir);

  const isPlaceholderScript = execPath && (execPath.endsWith('.sh') || execPath.endsWith('.bat') || execPath.endsWith('.cmd'));
  const hasRealBinary = execPath && fs.existsSync(execPath) && !isPlaceholderScript;

  // Never switch a downloaded game to a different development copy on rescan.
  if (!hasRealBinary) {
    if (!uninstalledDevGames.has(gameId)) {
      const localDevRepo = findLocalDevGodotProject(gameId);
      const godotBin = await resolveGodotBinaryAsync();
      if (localDevRepo && godotBin) {
        console.log(`[Launcher] Launching ${gameId} directly via local development Godot engine (${godotBin})...`);
        const command = localDevLaunch(localDevRepo, godotBin, customArgs);
        const child = spawn(command.executable, command.args, {
          cwd: command.cwd,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();

        const startTime = Date.now();
        runningProcesses.set(gameId, { proc: child, startTime });
        mainWindow?.webContents.send('game-status-changed', { gameId, status: 'RUNNING' });

        child.on('error', (err) => {
          console.error('Godot dev engine error:', err);
          runningProcesses.delete(gameId);
          mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED', exitCode: -1 });
        });

        child.on('exit', (code) => {
          const elapsedMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));
          runningProcesses.delete(gameId);

          // Update playtime in manifest
          const manifestPath = path.join(gameDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              meta.lastPlayedAt = Date.now();
              meta.totalPlaytimeMinutes = (meta.totalPlaytimeMinutes || 0) + elapsedMinutes;
              fs.writeFileSync(manifestPath, JSON.stringify(meta, null, 2));
            } catch (e) {}
          }

          mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED', exitCode: code || 0 });
        });

        return true;
      }
    }
  }

  if (!execPath || !fs.existsSync(execPath)) {
    uninstalledDevGames.add(gameId);
    delete cachedInstalledGames[gameId];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game-status-changed', { gameId, status: 'NOT_INSTALLED' });
      mainWindow.webContents.send('launcher:installed-games-updated', cachedInstalledGames);
    }
    scanInstalledGames().catch(() => {});

    dialog.showErrorBox(
      'Game Not Found',
      `Could not find executable for "${gameId}" in:\n${gameDir}\n\nThe game state has been reset to "Install Game" so you can reinstall it.`
    );
    return false;
  }

  try {
    let child: ChildProcess;
    const isWindows = process.platform === 'win32';
    const isBatch = execPath.toLowerCase().endsWith('.bat') || execPath.toLowerCase().endsWith('.cmd');

    if (process.platform === 'darwin' && execPath.endsWith('.app')) {
      child = spawn('open', ['-n', '-W', execPath, '--args', ...customArgs], { detached: true });
    } else {
      child = spawn(execPath, customArgs, {
        detached: true,
        cwd: path.dirname(execPath),
        stdio: 'ignore',
        shell: isWindows && isBatch ? true : false,
        windowsHide: false
      });
      child.unref();
    }

    const startTime = Date.now();
    runningProcesses.set(gameId, { proc: child, startTime });
    mainWindow?.webContents.send('game-status-changed', { gameId, status: 'RUNNING' });

    child.on('exit', (code) => {
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));
      runningProcesses.delete(gameId);

      const manifestPath = path.join(gameDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          meta.lastPlayedAt = Date.now();
          meta.totalPlaytimeMinutes = (meta.totalPlaytimeMinutes || 0) + elapsedMinutes;
          fs.writeFileSync(manifestPath, JSON.stringify(meta, null, 2));
        } catch (e) {}
      }

      mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED', exitCode: code || 0 });
    });

    if (cfg.closeLauncherOnGameStart && mainWindow) {
      mainWindow.minimize();
    }

    return true;
  } catch (err: any) {
    console.error('Failed to spawn game process:', err);
    runningProcesses.delete(gameId);

    const execStillExists = execPath && fs.existsSync(execPath);
    if (!execStillExists) {
      uninstalledDevGames.add(gameId);
      delete cachedInstalledGames[gameId];
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-status-changed', { gameId, status: 'NOT_INSTALLED' });
        mainWindow.webContents.send('launcher:installed-games-updated', cachedInstalledGames);
      }
      scanInstalledGames().catch(() => {});
    } else {
      mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED', exitCode: -1 });
    }

    dialog.showErrorBox('Launch Failed', err.message);
    return false;
  }
});

ipcMain.handle('launcher:launch-web-game', async (_event, gameId: string, url: string) => {
  try {
    const cfg = loadConfig();
    const gameDir = path.join(cfg.libraryPath, gameId);
    fs.mkdirSync(gameDir, { recursive: true });

    const webGameWin = new BrowserWindow({
      width: 1280,
      height: 760,
      minWidth: 960,
      minHeight: 540,
      backgroundColor: '#0a0c13',
      title: 'Inaayah Games - Web Player',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    webGameWin.loadURL(url);

    const startTime = Date.now();
    mainWindow?.webContents.send('game-status-changed', { gameId, status: 'RUNNING' });

    webGameWin.on('closed', () => {
      const elapsedMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));
      const manifestPath = path.join(gameDir, 'manifest.json');
      let meta: any = {
        id: gameId,
        version: '1.0.0',
        installPath: url,
        installedAt: Date.now(),
        lastPlayedAt: Date.now(),
        totalPlaytimeMinutes: 0
      };
      if (fs.existsSync(manifestPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        } catch (e) {}
      }
      meta.lastPlayedAt = Date.now();
      meta.totalPlaytimeMinutes = (meta.totalPlaytimeMinutes || 0) + elapsedMinutes;
      fs.writeFileSync(manifestPath, JSON.stringify(meta, null, 2));

      mainWindow?.webContents.send('game-status-changed', { gameId, status: 'INSTALLED', exitCode: 0 });
    });

    if (cfg.closeLauncherOnGameStart && mainWindow) {
      mainWindow.minimize();
    }

    return true;
  } catch (err: any) {
    console.error('Failed to open web game:', err);
    dialog.showErrorBox('Launch Web Game Failed', err.message);
    return false;
  }
});

ipcMain.handle('launcher:open-external-url', async (_event, targetUrl: string) => {
  await shell.openExternal(targetUrl);
});

function compareVersions(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

interface MacPendingUpdate {
  version: string;
  extractedAppPath: string;
  targetAppBundle: string;
}

let macPendingUpdate: MacPendingUpdate | null = null;
let isMacUpdateDownloading = false;
let macUpdatePromise: Promise<void> | null = null;
let latestKnownLauncherVersion: string | null = null;

async function downloadAndExtractMacZip(url: string, zipPath: string, extractedDir: string, extractedAppPath: string, version: string): Promise<boolean> {
  console.log(`[MacUpdater] Fetching macOS update archive from ${url}...`);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': `InaayahLauncher/${app.getVersion()}` }
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch macOS update zip from ${url}: HTTP ${res.status}`);
  }
  const fileStream = fs.createWriteStream(zipPath);
  // @ts-ignore
  await pipeline(Readable.fromWeb(res.body), fileStream);

  console.log(`[MacUpdater] Download complete. Extracting via ditto to ${extractedDir}...`);
  if (fs.existsSync(extractedAppPath)) {
    fs.rmSync(extractedAppPath, { recursive: true, force: true });
  }
  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-xk', zipPath, extractedDir], (err, _stdout, stderr) => {
      if (err) {
        console.error('[MacUpdater] ditto extract error:', stderr || err.message);
        return reject(err);
      }
      resolve();
    });
  });

  return stagedAppMatchesVersion(extractedAppPath, version);
}

async function tryDownloadAndApplyMacPatch(
  url: string,
  patchZipPath: string,
  patchDir: string,
  targetAppBundle: string,
  extractedAppPath: string,
  version: string
): Promise<boolean> {
  console.log(`[MacUpdater] Checking lightweight macOS patch archive from ${url}...`);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': `InaayahLauncher/${app.getVersion()}` }
  });
  if (!res.ok || !res.body) {
    return false;
  }

  fs.mkdirSync(path.dirname(patchZipPath), { recursive: true });
  const fileStream = fs.createWriteStream(patchZipPath);
  // @ts-ignore
  await pipeline(Readable.fromWeb(res.body), fileStream);

  if (fs.existsSync(patchDir)) {
    fs.rmSync(patchDir, { recursive: true, force: true });
  }
  fs.mkdirSync(patchDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-xk', patchZipPath, patchDir], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const patched = await applyMacPatchToStagedBundle({
    installedBundle: targetAppBundle,
    patchExtractDir: patchDir,
    stagedBundle: extractedAppPath,
    expectedVersion: version,
    expectedElectronVersion: process.versions.electron,
    expectedArch: process.arch
  });

  try { fs.unlinkSync(patchZipPath); } catch {}
  try { fs.rmSync(patchDir, { recursive: true, force: true }); } catch {}

  return patched;
}

async function downloadMacUpdateInBackground(version: string, cfg: LauncherConfig): Promise<void> {
  if (macUpdatePromise) {
    return macUpdatePromise;
  }
  if (macPendingUpdate && macPendingUpdate.version === version && await stagedAppMatchesVersion(macPendingUpdate.extractedAppPath, version)) {
    mainWindow?.webContents.send('launcher-update-ready', version);
    return;
  }

  isMacUpdateDownloading = true;
  console.log(`[MacUpdater] Initiating background download for v${version}...`);

  macUpdatePromise = (async () => {
    const updateDir = path.join(app.getPath('userData'), 'mac_update');
    const { zipPath, patchZipPath, patchDir, extractedDir, extractedAppPath } = macUpdatePaths(updateDir, version);
    const targetAppBundle = path.resolve(process.execPath, '../../../');

    try {
      fs.mkdirSync(extractedDir, { recursive: true });

      // Check if previously downloaded, extracted, and verified
      if (await stagedAppMatchesVersion(extractedAppPath, version)) {
        console.log(`[MacUpdater] Update v${version} already downloaded and staged.`);
        macPendingUpdate = { version, extractedAppPath, targetAppBundle };
        mainWindow?.webContents.send('launcher-update-ready', version);
        return;
      }

      const gatewayUrl = (cfg.releaseGatewayUrl || 'https://api.inaayah.dev').replace(/\/$/, '');
      let stagedOk = false;
      let lastErr: Error | null = null;

      // 1. Try fast ~1.5 MB ASAR + Info.plist delta patch first (if targetAppBundle exists locally)
      if (targetAppBundle.endsWith('.app') && fs.existsSync(targetAppBundle)) {
        const patchUrls = [
          `${gatewayUrl}/api/launcher/download/mac?format=patch&version=${encodeURIComponent(version)}`,
          `https://github.com/inaayah/inaayah-launcher/releases/download/v${version}/Inaayah-Launcher-${version}-${process.arch}-mac-patch.zip`
        ];
        for (const patchUrl of patchUrls) {
          try {
            if (await tryDownloadAndApplyMacPatch(patchUrl, patchZipPath, patchDir, targetAppBundle, extractedAppPath, version)) {
              console.log(`[MacUpdater] Fast ~1.5MB patch update v${version} staged successfully!`);
              stagedOk = true;
              break;
            }
          } catch {}
        }
      }

      // 2. Fallback to full macOS .zip bundle if patch is unavailable or Electron runtime version changed
      if (!stagedOk) {
        const candidateUrls = [
          `${gatewayUrl}/api/launcher/download/mac?format=zip&version=${encodeURIComponent(version)}`,
          `https://github.com/inaayah/inaayah-launcher/releases/download/v${version}/Inaayah-Launcher-${version}-${process.arch}-mac.zip`
        ];
        for (const candidateUrl of candidateUrls) {
          try {
            if (await downloadAndExtractMacZip(candidateUrl, zipPath, extractedDir, extractedAppPath, version)) {
              stagedOk = true;
              break;
            }
            lastErr = new Error('Downloaded launcher does not match the requested version or is incomplete');
          } catch (e: any) {
            lastErr = e;
          }
        }
      }

      if (!stagedOk) {
        throw lastErr || new Error('Downloaded launcher does not match the requested version or is incomplete');
      }

      try { fs.unlinkSync(zipPath); } catch {}

      macPendingUpdate = {
        version,
        extractedAppPath,
        targetAppBundle
      };

      console.log(`[MacUpdater] Update v${version} staged and ready!`);
      mainWindow?.webContents.send('launcher-update-ready', version);
      if (Notification.isSupported()) {
        new Notification({
          title: 'Inaayah Launcher Update Ready',
          body: `Version v${version} downloaded. Click Restart to apply!`
        }).show();
      }
    } catch (err: any) {
      console.error('[MacUpdater] Background update failed:', err.message);
      if (Notification.isSupported()) new Notification({ title: 'Launcher update could not be prepared', body: err.message }).show();
    } finally {
      isMacUpdateDownloading = false;
      macUpdatePromise = null;
    }
  })();

  return macUpdatePromise;
}

async function fetchLatestLauncherRelease() {
  const currentVersion = app.getVersion();
  const cfg = loadConfig();
  const gatewayUrl = (cfg.releaseGatewayUrl || 'https://releases.inaayah.dev').replace(/\/$/, '');

  // 1. Prioritize Cloudflare edge gateway (cached, fast, and does NOT burn GitHub IP rate limits)
  try {
    const res = await fetch(`${gatewayUrl}/api/launcher/latest`, {
      headers: {
        'User-Agent': `InaayahLauncher/${currentVersion}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const latestTag = (data.version || data.tag_name || '').replace(/^v/, '');
      const releaseUrl = data.html_url || 'https://github.com/inaayah/inaayah-launcher/releases/latest';
      const isNewer = compareVersions(latestTag, currentVersion) > 0;
      return {
        isNewer,
        latestTag,
        currentVersion,
        releaseUrl,
        releaseName: data.name || `v${latestTag}`,
        publishedAt: data.publishedAt || data.published_at
      };
    }
  } catch (e: any) {
    // Gateway unreachable or timed out, attempt GitHub fallback
  }

  // 2. Direct GitHub API fallback
  try {
    const res = await fetch('https://api.github.com/repos/inaayah/inaayah-launcher/releases/latest', {
      headers: {
        'User-Agent': `InaayahLauncher/${currentVersion}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const latestTag = (data.tag_name || '').replace(/^v/, '');
      const releaseUrl = data.html_url || 'https://github.com/inaayah/inaayah-launcher/releases/latest';
      const isNewer = compareVersions(latestTag, currentVersion) > 0;
      return {
        isNewer,
        latestTag,
        currentVersion,
        releaseUrl,
        releaseName: data.name || `v${latestTag}`,
        publishedAt: data.published_at
      };
    }
    if (res.status === 403) {
      console.warn('[LauncherUpdate] GitHub API unauthenticated rate limit reached (HTTP 403). Using current version.');
    }
  } catch (e: any) {
    // Gracefully handle network offline
  }

  return {
    isNewer: false,
    latestTag: currentVersion,
    currentVersion,
    releaseUrl: 'https://github.com/inaayah/inaayah-launcher/releases/latest',
    releaseName: `v${currentVersion}`
  };
}

ipcMain.handle('launcher:check-for-updates', async () => {
  try {
    const info = await fetchLatestLauncherRelease();
    if (info.isNewer) {
      latestKnownLauncherVersion = info.latestTag;
    }
    if (info.isNewer && app.isPackaged) {
      if (process.platform === 'darwin') {
        downloadMacUpdateInBackground(info.latestTag, loadConfig()).catch(() => {});
      } else {
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdater] check error:', err.message);
        });
      }
    }
    return {
      success: true,
      updateAvailable: info.isNewer,
      version: info.latestTag,
      currentVersion: info.currentVersion,
      releaseUrl: info.releaseUrl
    };
  } catch (err: any) {
    console.error('Failed to check for launcher updates:', err);
    return {
      success: false,
      currentVersion: app.getVersion(),
      error: err.message
    };
  }
});

ipcMain.handle('launcher:restart-and-install-update', async () => {
  console.log('[AutoUpdater] restart-and-install-update triggered');

  // Development mode: restart immediately
  if (!app.isPackaged) {
    app.relaunch();
    app.exit(0);
    return;
  }

  // 1. Custom macOS Background Updater in-place swap
  if (process.platform === 'darwin') {
    if (!macPendingUpdate || !fs.existsSync(macPendingUpdate.extractedAppPath)) {
      let targetVersion = latestKnownLauncherVersion;
      if (!targetVersion) {
        const info = await fetchLatestLauncherRelease().catch(() => null);
        if (info?.isNewer) {
          targetVersion = info.latestTag;
        }
      }
      if (targetVersion) {
        await downloadMacUpdateInBackground(targetVersion, loadConfig());
      }
    }

    if (macPendingUpdate && fs.existsSync(macPendingUpdate.extractedAppPath)) {
      console.log(`[MacUpdater] Executing in-place swap for: ${macPendingUpdate.targetAppBundle}`);
      const scriptPath = path.join(os.tmpdir(), `inaayah_mac_updater_${Date.now()}.sh`);
      const scriptContent = macInstallScript({
        pid: process.pid,
        source: macPendingUpdate.extractedAppPath,
        target: macPendingUpdate.targetAppBundle,
        version: macPendingUpdate.version,
        logPath: path.join(app.getPath('userData'), 'mac_update', 'install.log')
      });
      fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

      // Spawn detached background process
      const child = spawn('/bin/bash', [scriptPath], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // Exit current application immediately so the swap proceeds
      app.removeAllListeners('window-all-closed');
      try {
        BrowserWindow.getAllWindows().forEach((w) => w.destroy());
      } catch {}
      app.exit(0);
      return;
    }
    return;
  }

  // Windows / Linux:
  app.removeAllListeners('window-all-closed');
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err: any) {
    console.warn('[AutoUpdater] quitAndInstall threw, forcing relaunch:', err?.message);
    app.relaunch();
    app.exit(0);
    return;
  }

  // Watchdog timer: ensure the process restarts and does not hang
  setTimeout(() => {
    try {
      BrowserWindow.getAllWindows().forEach((w) => w.destroy());
    } catch {}
    app.relaunch();
    app.exit(0);
  }, 1200);
});

ipcMain.handle('launcher:get-app-version', () => {
  return app.getVersion();
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
