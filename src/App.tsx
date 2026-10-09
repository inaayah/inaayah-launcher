import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { RotateCcw, Download, X } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { GameHero } from './components/GameHero';
import { LibraryGrid } from './components/LibraryGrid';
import { StoreCatalog } from './components/StoreCatalog';
import { DownloadsQueue } from './components/DownloadsQueue';
import { SettingsModal } from './components/SettingsModal';
import { catalogData } from './data/catalog';
import { launcherBridge } from './services/electronBridge';
import type {
  LauncherConfig,
  InstalledGame,
  DownloadProgress,
  GameStatus,
  GameCatalogItem
} from './types/launcher';
import { getAssetUrl } from './utils/assets';

export const App: React.FC = () => {
  const [config, setConfig] = useState<LauncherConfig>({
    libraryPath: '~/InaayahGames',
    autoUpdate: true,
    closeLauncherOnGameStart: false,
    nakamaHost: '94.130.227.190',
    nakamaPort: 7350,
    useSSL: false
  });

  const [currentTab, setCurrentTab] = useState<NavTab>('library');
  const [selectedGameId, setSelectedGameId] = useState<string>('aether-rush');
  const [isViewingDetail, setIsViewingDetail] = useState(false);
  const [installedGames, setInstalledGames] = useState<Record<string, InstalledGame>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [gameStatuses, setGameStatuses] = useState<Record<string, GameStatus>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [catalog, setCatalog] = useState<GameCatalogItem[]>(catalogData);

  // Update notifications
  const [updateReadyVersion, setUpdateReadyVersion] = useState<string | null>(null);
  const [updateAvailableInfo, setUpdateAvailableInfo] = useState<{ version: string; releaseUrl: string } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isRestartingLauncher, setIsRestartingLauncher] = useState(false);

  // User's personal library collection (persisted across sessions)
  const [ownedGameIds, setOwnedGameIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('inaayah_owned_games');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default games in user library: AetherRush & Kettle Court
    return ['aether-rush', 'kettle-court'];
  });

  const handleAddToLibrary = (gameId: string) => {
    setOwnedGameIds((prev) => {
      if (prev.includes(gameId)) return prev;
      const updated = [...prev, gameId];
      try {
        localStorage.setItem('inaayah_owned_games', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Only games that are installed locally OR owned/claimed appear in Library and Sidebar!
  const libraryGames = useMemo(() => {
    return catalog.filter((game) => {
      const isInstalled = Boolean(installedGames[game.id]);
      const isOwned = ownedGameIds.includes(game.id);
      return isInstalled || isOwned;
    });
  }, [catalog, installedGames, ownedGameIds]);

  const selectedGame = useMemo(() => {
    return catalog.find((g) => g.id === selectedGameId) || catalog[0] || catalogData[0];
  }, [catalog, selectedGameId]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const catalogRef = React.useRef<GameCatalogItem[]>(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  const computeGameStatuses = useCallback((
    currentCatalog: GameCatalogItem[],
    installed: Record<string, InstalledGame>,
    existingStatuses: Record<string, GameStatus>
  ): Record<string, GameStatus> => {
    const next = { ...existingStatuses };
    currentCatalog.forEach((game) => {
      const curr = next[game.id];
      if (curr === 'DOWNLOADING' || curr === 'EXTRACTING' || curr === 'RUNNING') {
        return;
      }
      const isDev = Boolean(
        installed[game.id]?.version?.includes('Local Dev') ||
        installed[game.id]?.installPath?.includes('godot')
      );
      if (isDev) {
        next[game.id] = 'INSTALLED';
      } else if (game.isComingSoon) {
        next[game.id] = 'NOT_INSTALLED';
      } else if (game.gameType === 'web') {
        next[game.id] = 'INSTALLED';
      } else if (installed[game.id]) {
        next[game.id] = (installed[game.id].version !== game.version)
          ? 'UPDATE_AVAILABLE'
          : 'INSTALLED';
      } else {
        next[game.id] = 'NOT_INSTALLED';
      }
    });
    return next;
  }, []);

  const autoUpdateDismissedRef = React.useRef<Set<string>>(new Set());
  const lastLauncherUpdateCheckRef = React.useRef<number>(0);

  const handleInstall = useCallback(async (gameId: string, background = false) => {
    const game = catalogRef.current.find((g) => g.id === gameId);
    if (!game || game.isComingSoon) return;
    handleAddToLibrary(gameId);

    setGameStatuses((prev) => ({ ...prev, [gameId]: 'DOWNLOADING' }));
    if (!background) {
      setCurrentTab('downloads');
    }
    try {
      await launcherBridge.downloadGame(gameId, game.version);
    } catch (err) {
      console.error('Download failed:', err);
      setGameStatuses((prev) => ({ ...prev, [gameId]: 'NOT_INSTALLED' }));
    }
  }, []);

  const handleCancelDownload = useCallback(async (gameId: string) => {
    const game = catalogRef.current.find((g) => g.id === gameId);
    if (game) {
      autoUpdateDismissedRef.current.add(`${gameId}_${game.version}`);
    }
    await launcherBridge.cancelDownload(gameId);
    setDownloads((prev) => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
    setGameStatuses((prev) => ({
      ...prev,
      [gameId]: installedGames[gameId] ? 'INSTALLED' : 'NOT_INSTALLED'
    }));
  }, [installedGames]);

  const refreshGames = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [cfg, installed, dyn] = await Promise.all([
        launcherBridge.getConfig(),
        launcherBridge.getInstalledGames(),
        launcherBridge.refreshCatalog().catch(() => null)
      ]);

      setConfig(cfg);
      setInstalledGames(installed);

      let activeCatalog = catalogRef.current;
      if (Array.isArray(dyn) && dyn.length > 0) {
        const map = new Map<string, GameCatalogItem>();
        catalogRef.current.forEach((g) => map.set(g.id, g));
        dyn.forEach((d) => {
          if (d && d.id) {
            const existing = map.get(d.id) || ({} as GameCatalogItem);
            map.set(d.id, {
              ...existing,
              ...d,
              coverArt: getAssetUrl(d.coverArt || existing.coverArt),
              heroBanner: getAssetUrl(d.heroBanner || existing.heroBanner),
              screenshots: Array.isArray(d.screenshots)
                ? d.screenshots.map((s: string) => getAssetUrl(s))
                : existing.screenshots?.map((s: string) => getAssetUrl(s)) || []
            });
          }
        });
        activeCatalog = Array.from(map.values());
        setCatalog(activeCatalog);
      }

      setGameStatuses((prev) => {
        const nextStatuses = computeGameStatuses(activeCatalog, installed, prev);

        // Automatic Game Updates: If enabled in Settings, automatically download game updates in the background
        if (cfg.autoUpdate) {
          activeCatalog.forEach((game) => {
            if (nextStatuses[game.id] === 'UPDATE_AVAILABLE') {
              const currStatus = prev[game.id];
              const isBusy = currStatus === 'DOWNLOADING' || currStatus === 'EXTRACTING' || currStatus === 'RUNNING';
              if (!isBusy && !autoUpdateDismissedRef.current.has(`${game.id}_${game.version}`)) {
                handleInstall(game.id, true /* background */);
              }
            }
          });
        }

        return nextStatuses;
      });

      // Quietly check for launcher self-updates at most once every 10 minutes (or on initial launch)
      const now = Date.now();
      if (now - lastLauncherUpdateCheckRef.current > 10 * 60 * 1000) {
        lastLauncherUpdateCheckRef.current = now;
        launcherBridge.checkLauncherUpdate?.().catch(() => {});
      }
    } catch (err) {
      console.error('Failed to refresh games:', err);
    } finally {
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), 450);
      }
    }
  }, [computeGameStatuses]);

  // Backward-compatible alias for existing action handlers
  const refreshInstalled = useCallback(async () => {
    return refreshGames(true);
  }, [refreshGames]);

  // 1. Initial load
  useEffect(() => {
    refreshGames(true);
  }, [refreshGames]);

  // 2. Real-time background auto-refresh every 30s so new releases appear without restart!
  useEffect(() => {
    const timer = setInterval(() => {
      refreshGames(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [refreshGames]);

  // 3. Window focus: automatically refresh when returning from Finder, terminal, or Godot
  useEffect(() => {
    const onWindowFocus = () => {
      refreshGames(true);
    };
    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, [refreshGames]);

  // 4. IPC Event Listeners
  useEffect(() => {
    const unsubProgress = launcherBridge.onDownloadProgress((prog) => {
      setDownloads((prev) => {
        if (prog.phase === 'COMPLETED') {
          const next = { ...prev };
          delete next[prog.gameId];
          return next;
        }
        return { ...prev, [prog.gameId]: prog };
      });

      setGameStatuses((prev) => ({
        ...prev,
        [prog.gameId]: prog.phase === 'EXTRACTING' ? 'EXTRACTING' : 'DOWNLOADING'
      }));

      if (prog.phase === 'COMPLETED') {
        refreshGames(true);
      }
    });

    const unsubInstalledGames = launcherBridge.onInstalledGamesUpdated?.((games) => {
      setInstalledGames(games);
      setGameStatuses((prev) => computeGameStatuses(catalogRef.current, games, prev));
    });

    const unsubStatus = launcherBridge.onGameStatusChanged((data) => {
      setGameStatuses((prev) => ({ ...prev, [data.gameId]: data.status }));
      if (data.status === 'NOT_INSTALLED') {
        setInstalledGames((prev) => {
          if (!prev[data.gameId]) return prev;
          const next = { ...prev };
          delete next[data.gameId];
          return next;
        });
      }
      if (data.status === 'INSTALLED' || data.status === 'NOT_INSTALLED') {
        refreshGames(true);
      }
    });

    const unsubReady = launcherBridge.onLauncherUpdateReady((version) => {
      setUpdateReadyVersion(version);
      setBannerDismissed(false);
    });

    const unsubAvail = launcherBridge.onLauncherUpdateAvailable((info) => {
      setUpdateAvailableInfo(info);
      setBannerDismissed(false);
    });

    return () => {
      unsubProgress();
      unsubStatus();
      unsubInstalledGames?.();
      unsubReady();
      unsubAvail();
    };
  }, [computeGameStatuses, refreshGames]);

  const handleLaunch = async (gameId: string) => {
    const game = catalog.find((g) => g.id === gameId);
    if (!game) return;

    setGameStatuses((prev) => ({ ...prev, [gameId]: 'RUNNING' }));
    try {
      let ok = false;
      if (game.gameType === 'web' && game.webUrl) {
        ok = await launcherBridge.launchWebGame(gameId, game.webUrl);
      } else {
        ok = await launcherBridge.launchGame(gameId);
      }
      if (!ok) {
        // If launch failed (e.g. game executable missing/deleted on disk), rescan library
        const updated = await launcherBridge.getInstalledGames();
        setInstalledGames(updated);
        setGameStatuses((prev) => ({
          ...prev,
          [gameId]: updated[gameId] || game.gameType === 'web' ? 'INSTALLED' : 'NOT_INSTALLED'
        }));
      }
    } catch (err) {
      console.error('Launch failed:', err);
      const updated: Record<string, InstalledGame> = await launcherBridge.getInstalledGames().catch(() => ({}));
      setInstalledGames(updated);
      setGameStatuses((prev) => ({
        ...prev,
        [gameId]: updated[gameId] || game.gameType === 'web' ? 'INSTALLED' : 'NOT_INSTALLED'
      }));
    }
  };

  const handleUninstall = async (gameId: string) => {
    // Optimistically remove game from installed list and reset status immediately
    setGameStatuses((prev) => ({ ...prev, [gameId]: 'NOT_INSTALLED' }));
    setInstalledGames((prev) => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });

    try {
      await launcherBridge.uninstallGame(gameId);
    } catch (err) {
      console.error('Uninstall failed:', err);
    }
    await refreshInstalled();
  };

  const handleCheckUpdates = async (gameId: string) => {
    const game = catalog.find((g) => g.id === gameId);
    if (!game) return;
    if (installedGames[gameId]?.version?.includes('Local Dev')) return;
    const hasUpdate = await launcherBridge.checkUpdates(gameId, game.version);
    if (hasUpdate) {
      setGameStatuses((prev) => ({ ...prev, [gameId]: 'UPDATE_AVAILABLE' }));
    }
  };

  const handleSaveConfig = async (newCfg: Partial<LauncherConfig>) => {
    const updated = await launcherBridge.setConfig(newCfg);
    setConfig(updated);
  };

  return (
    <div className="app-container">
      <TitleBar
        config={config}
        onOpenSettings={() => setIsSettingsOpen(true)}
        updateReadyVersion={updateReadyVersion}
        updateAvailableVersion={updateAvailableInfo?.version}
        updateReleaseUrl={updateAvailableInfo?.releaseUrl}
        onRestartUpdate={() => launcherBridge.restartAndInstallUpdate()}
      />

      {/* In-App Update Alert Banner */}
      {!bannerDismissed && (updateReadyVersion || updateAvailableInfo) && (
        <div className="update-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="bell-badge-pulse" style={{ position: 'relative', display: 'inline-block' }} />
            {updateReadyVersion ? (
              <span style={{ fontSize: 13 }}>
                <strong>Inaayah Launcher v{updateReadyVersion}</strong> has been downloaded and is ready to install!
              </span>
            ) : (
              <span style={{ fontSize: 13 }}>
                <strong>Inaayah Launcher v{updateAvailableInfo?.version}</strong> is available with official bug fixes and improvements.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {updateReadyVersion ? (
              <button
                className="btn-primary-action play"
                style={{ height: 28, padding: '0 14px', fontSize: 12, gap: 6 }}
                disabled={isRestartingLauncher}
                onClick={() => {
                  setIsRestartingLauncher(true);
                  launcherBridge.restartAndInstallUpdate();
                }}
              >
                <RotateCcw size={12} className={isRestartingLauncher ? 'spin-fast' : 'spin-slow'} />
                <span>{isRestartingLauncher ? 'Applying Update...' : 'Restart Now'}</span>
              </button>
            ) : (
              <button
                className="btn-primary-action play"
                style={{ height: 28, padding: '0 14px', fontSize: 12, gap: 6 }}
                onClick={() =>
                  launcherBridge.openExternalUrl(
                    updateAvailableInfo?.releaseUrl || 'https://github.com/inaayah/inaayah-launcher/releases/latest'
                  )
                }
              >
                <Download size={12} />
                <span>Download v{updateAvailableInfo?.version}</span>
              </button>
            )}
            <button
              className="window-btn"
              style={{ width: 26, height: 26 }}
              title="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="main-body">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab);
            if (tab === 'library') {
              setIsViewingDetail(false);
            }
          }}
          catalog={libraryGames}
          installedGames={installedGames}
          selectedGameId={selectedGameId}
          isViewingDetail={isViewingDetail}
          onSelectGame={(id) => {
            setSelectedGameId(id);
            setCurrentTab('library');
            setIsViewingDetail(true);
          }}
          activeDownloads={downloads}
          gameStatuses={gameStatuses}
          onOpenSettings={() => setIsSettingsOpen(true)}
          libraryPath={config.libraryPath}
          isRefreshing={isRefreshing}
          onRefresh={() => refreshGames(false)}
        />

        <main className="content-area">
          {currentTab === 'store' && (
            <StoreCatalog
              catalog={catalog}
              installedGames={installedGames}
              gameStatuses={gameStatuses}
              ownedGameIds={ownedGameIds}
              onSelectGame={(id) => {
                setSelectedGameId(id);
                setCurrentTab('library');
                setIsViewingDetail(true);
              }}
              onLaunch={handleLaunch}
              onInstall={handleInstall}
              onAddToLibrary={handleAddToLibrary}
              isRefreshing={isRefreshing}
              onRefresh={() => refreshGames(false)}
            />
          )}

          {currentTab === 'library' && (
            isViewingDetail ? (
              <GameHero
                game={selectedGame}
                installed={installedGames[selectedGame.id]}
                downloadProgress={downloads[selectedGame.id]}
                status={gameStatuses[selectedGame.id] || 'NOT_INSTALLED'}
                onBackToLibrary={() => setIsViewingDetail(false)}
                onInstall={handleInstall}
                onCancelDownload={handleCancelDownload}
                onLaunch={handleLaunch}
                onUninstall={handleUninstall}
                onCheckUpdates={handleCheckUpdates}
              />
            ) : (
              <LibraryGrid
                catalog={libraryGames}
                installedGames={installedGames}
                gameStatuses={gameStatuses}
                activeDownloads={downloads}
                onSelectGame={(id) => {
                  setSelectedGameId(id);
                  setIsViewingDetail(true);
                }}
                onLaunch={handleLaunch}
                onInstall={handleInstall}
                onOpenStore={() => setCurrentTab('store')}
                isRefreshing={isRefreshing}
                onRefresh={() => refreshGames(false)}
              />
            )
          )}

          {currentTab === 'downloads' && (
            <DownloadsQueue
              catalog={catalog}
              downloads={downloads}
              onCancel={handleCancelDownload}
              onSelectGame={(id) => {
                setSelectedGameId(id);
                setCurrentTab('library');
                setIsViewingDetail(true);
              }}
            />
          )}
        </main>
      </div>

      <SettingsModal
        config={config}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
};
