import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { RotateCcw, Download, X } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { GameHero } from './components/GameHero';
import { LibraryGrid } from './components/LibraryGrid';
import { StoreCatalog } from './components/StoreCatalog';
import { DownloadsQueue } from './components/DownloadsQueue';
import { SettingsModal } from './components/SettingsModal';
import { AuthGate } from './components/AuthGate';
import { StudioAnalytics } from './components/StudioAnalytics';
import { catalogData } from './data/catalog';
import { launcherBridge } from './services/electronBridge';
import { authService, getStoredUser } from './services/authService';
import type {
  LauncherConfig,
  InstalledGame,
  DownloadProgress,
  GameStatus,
  GameCatalogItem,
  LauncherUser
} from './types/launcher';
import { getAssetUrl } from './utils/assets';
import { computeGameStatuses, settledGameStatus } from './utils/gameStatus';

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
  const [selectedGameId, setSelectedGameId] = useState<string>('vigilante-red-city');
  const [isViewingDetail, setIsViewingDetail] = useState(false);
  const [installedGames, setInstalledGames] = useState<Record<string, InstalledGame>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [gameStatuses, setGameStatuses] = useState<Record<string, GameStatus>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [catalog, setCatalog] = useState<GameCatalogItem[]>(catalogData);
  const [currentUser, setCurrentUser] = useState<LauncherUser | null>(() => getStoredUser());
  const [authChecking, setAuthChecking] = useState<boolean>(true);

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
    // New profiles start with the released studio games.
    return ['vigilante-red-city', 'aether-rush', 'kettle-court'];
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
  const installedRef = React.useRef(installedGames);
  const installedRevisionRef = React.useRef(0);
  const refreshSequenceRef = React.useRef(0);
  const pendingDownloadsRef = React.useRef(new Set<string>());

  const acceptInstalledGames = useCallback((games: Record<string, InstalledGame>) => {
    installedRevisionRef.current++;
    installedRef.current = games;
    setInstalledGames(games);
  }, []);

  const settleDownload = useCallback((gameId: string) => {
    const game = catalogRef.current.find(g => g.id === gameId);
    setGameStatuses(prev => ({ ...prev, [gameId]: settledGameStatus(game, installedRef.current[gameId]) }));
  }, []);

  const autoUpdateDismissedRef = React.useRef<Set<string>>(new Set());
  const lastLauncherUpdateCheckRef = React.useRef<number>(0);

  const handleInstall = useCallback(async (gameId: string, background = false) => {
    const game = catalogRef.current.find((g) => g.id === gameId);
    if (!game || game.isComingSoon || pendingDownloadsRef.current.has(gameId)) return;
    pendingDownloadsRef.current.add(gameId);
    handleAddToLibrary(gameId);

    setGameStatuses((prev) => ({ ...prev, [gameId]: 'DOWNLOADING' }));
    if (!background) {
      setCurrentTab('downloads');
    }
    authService
      .sendHeartbeat('game_download', { gameId, gameVersion: game.version })
      .catch(() => {});
    try {
      const completed = await launcherBridge.downloadGame(gameId, game.version);
      if (!completed) autoUpdateDismissedRef.current.add(`${gameId}_${game.version}`);
    } catch (err) {
      console.error('Download failed:', err);
      autoUpdateDismissedRef.current.add(`${gameId}_${game.version}`);
    } finally {
      pendingDownloadsRef.current.delete(gameId);
      const games = await launcherBridge.getInstalledGames().catch(() => installedRef.current);
      acceptInstalledGames(games);
      settleDownload(gameId);
    }
  }, [acceptInstalledGames, settleDownload]);

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
    settleDownload(gameId);
  }, [settleDownload]);

  const refreshGames = useCallback(async (silent = false) => {
    const sequence = ++refreshSequenceRef.current;
    const installedRevision = installedRevisionRef.current;
    if (!silent) setIsRefreshing(true);
    try {
      const [cfg, installed, dyn] = await Promise.all([
        launcherBridge.getConfig(),
        launcherBridge.getInstalledGames(),
        launcherBridge.refreshCatalog().catch(() => null)
      ]);

      if (sequence !== refreshSequenceRef.current) return;
      setConfig(cfg);
      // An IPC installation snapshot received during this request is newer.
      const currentInstalled = installedRevision === installedRevisionRef.current ? installed : installedRef.current;
      if (installedRevision === installedRevisionRef.current) acceptInstalledGames(installed);

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
        catalogRef.current = activeCatalog;
        setCatalog(activeCatalog);
      }

      setGameStatuses(prev => computeGameStatuses(activeCatalog, currentInstalled, prev));

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
  }, [acceptInstalledGames]);

  useEffect(() => {
    if (!config.autoUpdate) return;
    for (const game of catalog) {
      if (gameStatuses[game.id] === 'UPDATE_AVAILABLE' &&
          !autoUpdateDismissedRef.current.has(`${game.id}_${game.version}`)) {
        void handleInstall(game.id, true);
      }
    }
  }, [catalog, config.autoUpdate, gameStatuses, handleInstall]);

  // Backward-compatible alias for existing action handlers
  const refreshInstalled = useCallback(async () => {
    return refreshGames(true);
  }, [refreshGames]);

  // 1. Initial load & session verification
  useEffect(() => {
    let active = true;
    const minSplashDelay = new Promise((resolve) => setTimeout(resolve, 450));
    Promise.all([
      authService.verifySession().catch(() => null),
      refreshGames(true).catch(() => {}),
      minSplashDelay
    ]).then(([verified]) => {
      if (!active) return;
      setCurrentUser(verified);
      setAuthChecking(false);
    });
    authService.sendHeartbeat('app_launch').catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshGames]);

  // 1b. Periodic active player heartbeat (every 2 minutes)
  useEffect(() => {
    const hbTimer = setInterval(() => {
      authService.sendHeartbeat('heartbeat').catch(() => {});
    }, 120000);
    return () => clearInterval(hbTimer);
  }, []);

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

      if (prog.phase === 'COMPLETED' || prog.phase === 'ERROR') {
        if (prog.phase === 'ERROR') {
          const game = catalogRef.current.find(g => g.id === prog.gameId);
          if (game) autoUpdateDismissedRef.current.add(`${game.id}_${game.version}`);
        }
        settleDownload(prog.gameId);
        void refreshGames(true);
      } else {
        setGameStatuses(prev => ({ ...prev,
          [prog.gameId]: prog.phase === 'EXTRACTING' ? 'EXTRACTING' : 'DOWNLOADING'
        }));
      }
    });

    const unsubInstalledGames = launcherBridge.onInstalledGamesUpdated?.((games) => {
      acceptInstalledGames(games);
      setGameStatuses(prev => computeGameStatuses(catalogRef.current, games, prev));
    });

    const unsubStatus = launcherBridge.onGameStatusChanged((data) => {
      setGameStatuses((prev) => ({ ...prev, [data.gameId]: data.status }));
      if (data.status === 'NOT_INSTALLED') {
        const next = { ...installedRef.current };
        delete next[data.gameId];
        acceptInstalledGames(next);
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
  }, [acceptInstalledGames, refreshGames, settleDownload]);

  const handleLaunch = async (gameId: string) => {
    const game = catalog.find((g) => g.id === gameId);
    if (!game) return;

    setGameStatuses((prev) => ({ ...prev, [gameId]: 'RUNNING' }));
    authService
      .sendHeartbeat('game_launch', { gameId, gameVersion: game.version })
      .catch(() => {});
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
        acceptInstalledGames(updated);
        setGameStatuses((prev) => ({
          ...prev,
          [gameId]: updated[gameId] || game.gameType === 'web' ? 'INSTALLED' : 'NOT_INSTALLED'
        }));
      }
    } catch (err) {
      console.error('Launch failed:', err);
      const updated: Record<string, InstalledGame> = await launcherBridge.getInstalledGames().catch(() => ({}));
      acceptInstalledGames(updated);
      setGameStatuses((prev) => ({
        ...prev,
        [gameId]: updated[gameId] || game.gameType === 'web' ? 'INSTALLED' : 'NOT_INSTALLED'
      }));
    }
  };

  const handleUninstall = async (gameId: string) => {
    // Optimistically remove game from installed list and reset status immediately
    setGameStatuses((prev) => ({ ...prev, [gameId]: 'NOT_INSTALLED' }));
    const remaining = { ...installedRef.current };
    delete remaining[gameId];
    acceptInstalledGames(remaining);

    try {
      await launcherBridge.uninstallGame(gameId);
    } catch (err) {
      console.error('Uninstall failed:', err);
    }
    await refreshInstalled();
  };

  const handleCheckUpdates = async (gameId: string) => {
    // Ask the gateway first; the catalog captured when the page opened may be stale.
    await refreshGames(true);
  };

  const handleSaveConfig = async (newCfg: Partial<LauncherConfig>) => {
    const updated = await launcherBridge.setConfig(newCfg);
    setConfig(updated);
  };

  const handleLogout = async () => {
    await authService.logout(config.releaseGatewayUrl);
    setCurrentUser(null);
    if (currentTab === 'analytics') {
      setCurrentTab('library');
    }
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

      {authChecking ? (
        <div className="launcher-splash-screen" role="status" aria-live="polite">
          <div className="splash-logo-ring">
            <img
              src={getAssetUrl('icon.png')}
              alt="Inaayah Studio"
              style={{ width: 52, height: 52, borderRadius: 12 }}
            />
          </div>
          <div className="splash-text-group">
            <div className="splash-kicker">INAAYAH STUDIO NETWORK</div>
            <h2 className="splash-title">Verifying Account Session...</h2>
          </div>
          <div className="splash-progress-track">
            <div className="splash-progress-bar" />
          </div>
        </div>
      ) : !currentUser ? (
        <AuthGate
          gatewayUrl={config.releaseGatewayUrl}
          onAuthenticated={(user) => {
            setCurrentUser(user);
            authService.sendHeartbeat('app_launch', undefined, config.releaseGatewayUrl).catch(() => {});
          }}
        />
      ) : (
        <>
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
                    disabled={isRestartingLauncher}
                    onClick={() => {
                      setIsRestartingLauncher(true);
                      launcherBridge.restartAndInstallUpdate();
                    }}
                  >
                    {isRestartingLauncher ? (
                      <RotateCcw size={12} className="spin-fast" />
                    ) : (
                      <Download size={12} />
                    )}
                    <span>
                      {isRestartingLauncher
                        ? `Updating to v${updateAvailableInfo?.version}...`
                        : `Update Now (v${updateAvailableInfo?.version})`}
                    </span>
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
              currentUser={currentUser}
              onLogout={handleLogout}
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

              {currentTab === 'analytics' && currentUser?.role === 'admin' && (
                <StudioAnalytics
                  currentUser={currentUser}
                  gatewayUrl={config.releaseGatewayUrl}
                />
              )}
            </main>
          </div>
        </>
      )}

      <SettingsModal
        config={config}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
};
