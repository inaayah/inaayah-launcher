import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { GameHero } from './components/GameHero';
import { StoreCatalog } from './components/StoreCatalog';
import { DownloadsQueue } from './components/DownloadsQueue';
import { SettingsModal } from './components/SettingsModal';
import { catalogData } from './data/catalog';
import { launcherBridge } from './services/electronBridge';
import type {
  LauncherConfig,
  InstalledGame,
  DownloadProgress,
  GameStatus
} from './types/launcher';

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
  const [installedGames, setInstalledGames] = useState<Record<string, InstalledGame>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [gameStatuses, setGameStatuses] = useState<Record<string, GameStatus>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const selectedGame = useMemo(() => {
    return catalogData.find((g) => g.id === selectedGameId) || catalogData[0];
  }, [selectedGameId]);

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
        if (installed[game.id]) {
          statuses[game.id] =
            installed[game.id].version !== game.version ? 'UPDATE_AVAILABLE' : 'INSTALLED';
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

    return () => {
      unsubProgress();
      unsubStatus();
    };
  }, [refreshInstalled]);

  // Handlers
  const handleInstall = async (gameId: string) => {
    const game = catalogData.find((g) => g.id === gameId);
    if (!game) return;

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
    setGameStatuses((prev) => ({ ...prev, [gameId]: 'RUNNING' }));
    try {
      await launcherBridge.launchGame(gameId);
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
    const game = catalogData.find((g) => g.id === gameId);
    if (!game) return;
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
      <TitleBar config={config} onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="main-body">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          catalog={catalogData}
          installedGames={installedGames}
          selectedGameId={selectedGameId}
          onSelectGame={(id) => {
            setSelectedGameId(id);
            setCurrentTab('library');
          }}
          activeDownloads={downloads}
          gameStatuses={gameStatuses}
          onOpenSettings={() => setIsSettingsOpen(true)}
          libraryPath={config.libraryPath}
        />

        <main className="content-area">
          {currentTab === 'store' && (
            <StoreCatalog
              catalog={catalogData}
              installedGames={installedGames}
              onSelectGame={(id) => {
                setSelectedGameId(id);
                setCurrentTab('library');
              }}
              onInstall={handleInstall}
            />
          )}

          {currentTab === 'library' && (
            <GameHero
              game={selectedGame}
              installed={installedGames[selectedGame.id]}
              downloadProgress={downloads[selectedGame.id]}
              status={gameStatuses[selectedGame.id] || 'NOT_INSTALLED'}
              onInstall={handleInstall}
              onCancelDownload={handleCancelDownload}
              onLaunch={handleLaunch}
              onUninstall={handleUninstall}
              onCheckUpdates={handleCheckUpdates}
            />
          )}

          {currentTab === 'downloads' && (
            <DownloadsQueue
              catalog={catalogData}
              downloads={downloads}
              onCancel={handleCancelDownload}
              onSelectGame={(id) => {
                setSelectedGameId(id);
                setCurrentTab('library');
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
