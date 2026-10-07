import React from 'react';
import {
  ShoppingBag,
  Library,
  Download,
  Settings,
  HardDrive
} from 'lucide-react';
import type { GameCatalogItem, InstalledGame, DownloadProgress, GameStatus } from '../types/launcher';

export type NavTab = 'store' | 'library' | 'downloads';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  catalog: GameCatalogItem[];
  installedGames: Record<string, InstalledGame>;
  selectedGameId: string;
  onSelectGame: (gameId: string) => void;
  activeDownloads: Record<string, DownloadProgress>;
  gameStatuses: Record<string, GameStatus>;
  onOpenSettings: () => void;
  libraryPath: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  catalog,
  installedGames,
  selectedGameId,
  onSelectGame,
  activeDownloads,
  gameStatuses,
  onOpenSettings,
  libraryPath
}) => {
  const activeDownloadsCount = Object.keys(activeDownloads).length;
  const installedCount = Object.keys(installedGames).length;

  return (
    <aside className="sidebar">
      <div className="nav-section">
        <span className="nav-section-title">Navigation</span>

        <button
          className={`nav-item ${currentTab === 'store' ? 'active' : ''}`}
          onClick={() => onSelectTab('store')}
        >
          <div className="nav-item-left">
            <ShoppingBag size={18} />
            <span>Discover</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'library' ? 'active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <div className="nav-item-left">
            <Library size={18} />
            <span>My Library</span>
          </div>
          {installedCount > 0 && <span className="nav-badge">{installedCount}</span>}
        </button>

        <button
          className={`nav-item ${currentTab === 'downloads' ? 'active' : ''}`}
          onClick={() => onSelectTab('downloads')}
        >
          <div className="nav-item-left">
            <Download size={18} />
            <span>Downloads</span>
          </div>
          {activeDownloadsCount > 0 && (
            <span className="nav-badge" style={{ background: 'rgba(0, 240, 255, 0.3)', color: '#00f0ff' }}>
              {activeDownloadsCount}
            </span>
          )}
        </button>
      </div>

      <div className="nav-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <span className="nav-section-title">Games</span>
        <div className="library-quick-list">
          {catalog.map((game) => {
            const isInstalled = Boolean(installedGames[game.id]);
            const isDownloading = Boolean(activeDownloads[game.id]);
            const isRunning = gameStatuses[game.id] === 'RUNNING';
            const isSelected = selectedGameId === game.id;

            return (
              <div
                key={game.id}
                className={`quick-game-item ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  onSelectGame(game.id);
                  onSelectTab('library');
                }}
              >
                <div
                  className="quick-game-icon"
                  style={{ backgroundImage: `url(${game.coverArt})` }}
                />
                <span className="quick-game-title">{game.title}</span>
                <span
                  className={`status-dot ${
                    isRunning
                      ? 'running'
                      : isDownloading
                      ? 'downloading'
                      : isInstalled
                      ? 'installed'
                      : ''
                  }`}
                  title={
                    isRunning
                      ? 'Game Running'
                      : isDownloading
                      ? 'Downloading'
                      : isInstalled
                      ? 'Ready to Play'
                      : 'Not Installed'
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="nav-section" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <button className="nav-item" onClick={onOpenSettings}>
          <div className="nav-item-left">
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </button>

        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            fontSize: 11,
            color: 'var(--text-muted)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, color: 'var(--text-secondary)' }}>
            <HardDrive size={12} />
            <span>Library Storage</span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={libraryPath}
          >
            {libraryPath}
          </div>
        </div>
      </div>
    </aside>
  );
};
