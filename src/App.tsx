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

  // Load initial data
  const refreshInstalled = useCallback(async () => {
    try {
      const [cfg, installed] = await Promise.all([
        launcherBridge.getConfig(),
        launcherBridge.getInstalledGames()
      ]);
      setConfig(cfg);
      setInstalledGames(installed);

      // Compute initial statuses
      const statuses: Record<string, GameStatus> = {};
      catalogData.forEach((game) => {
        if (game.isComingSoon) {
          statuses[game.id] = 'NOT_INSTALLED';
        } else if (game.gameType === 'web') {
          statuses[game.id] = 'INSTALLED';
        } else if (installed[game.id]) {
          const isDev = Boolean(installed[game.id].version?.includes('Local Dev') || installed[game.id].installPath?.includes('godot'));
          statuses[game.id] = (!isDev && installed[game.id].version !== game.version) ? 'UPDATE_AVAILABLE' : 'INSTALLED';
        } else {
          statuses[game.id] = 'NOT_INSTALLED';
        }
      });
      setGameStatuses((prev) => ({ ...statuses, ...prev }));
    } catch (err) {
      console.error('Failed to initialize launcher bridge:', err);
    }
  }, []);

  useEffect(() => {
    refreshInstalled();
    launcherBridge.refreshCatalog().then((dyn) => {
      if (Array.isArray(dyn) && dyn.length > 0) {
        setCatalog((prev) => {
          const map = new Map<string, GameCatalogItem>();
          prev.forEach((g) => map.set(g.id, g));
          dyn.forEach((d) => {
            if (d && d.id) {
              const existing = map.get(d.id) || {} as GameCatalogItem;
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
          const merged = Array.from(map.values());

          // Automatically compute statuses for any newly discovered games
          setGameStatuses((prevStatuses) => {
            const nextStatuses = { ...prevStatuses };
            merged.forEach((game) => {
              if (!nextStatuses[game.id]) {
                if (game.isComingSoon) {
                  nextStatuses[game.id] = 'NOT_INSTALLED';
                } else if (game.gameType === 'web') {
                  nextStatuses[game.id] = 'INSTALLED';
                } else if (installedGames[game.id]) {
                  const isDev = Boolean(installedGames[game.id].version?.includes('Local Dev') || installedGames[game.id].installPath?.includes('godot'));
                    nextStatuses[game.id] = (!isDev && installedGames[game.id].version !== game.version) ? 'UPDATE_AVAILABLE' : 'INSTALLED';
                } else {
                  nextStatuses[game.id] = 'NOT_INSTALLED';
                }
              }
            });
            return nextStatuses;
          });

          return merged;
        });
      }
    }).catch(() => {});

    // Listeners for progress and status
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
        refreshInstalled();
      }
    });

    const unsubStatus = launcherBridge.onGameStatusChanged((data) => {
      setGameStatuses((prev) => ({ ...prev, [data.gameId]: data.status }));
      if (data.status === 'INSTALLED' || data.status === 'NOT_INSTALLED') {
        refreshInstalled();
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
      unsubReady();
      unsubAvail();
    };
  }, [refreshInstalled]);

  // Handlers
  const handleInstall = async (gameId: string) => {
    const game = catalog.find((g) => g.id === gameId);
    if (!game || game.isComingSoon) return;
    handleAddToLibrary(gameId);

    setGameStatuses((prev) => ({ ...prev, [gameId]: 'DOWNLOADING' }));
    setCurrentTab('downloads');
    try {
      await launcherBridge.downloadGame(gameId, game.version);
    } catch (err) {
      console.error('Download failed:', err);
      setGameStatuses((prev) => ({ ...prev, [gameId]: 'NOT_INSTALLED' }));
    }
  };

  const handleCancelDownload = async (gameId: string) => {
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
  };

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
        setGameStatuses((prev) => ({ ...prev, [gameId]: 'INSTALLED' }));
      }
    } catch (err) {
      console.error('Launch failed:', err);
      setGameStatuses((prev) => ({ ...prev, [gameId]: 'INSTALLED' }));
    }
  };

  const handleUninstall = async (gameId: string) => {
    await launcherBridge.uninstallGame(gameId);
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
                onClick={() => launcherBridge.restartAndInstallUpdate()}
              >
                <RotateCcw size={12} className="spin-slow" />
                <span>Restart Now</span>
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
        />

        <main className="content-area">
          {currentTab === 'store' && (
            <StoreCatalog
              catalog={catalog}
              installedGames={installedGames}
              ownedGameIds={ownedGameIds}
              onSelectGame={(id) => {
                setSelectedGameId(id);
                setCurrentTab('library');
                setIsViewingDetail(true);
              }}
              onInstall={handleInstall}
              onAddToLibrary={handleAddToLibrary}
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
