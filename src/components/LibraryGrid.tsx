import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Search,
  Play,
  Download,
  CheckCircle,
  Globe,
  Clock,
  Sparkles,
  RefreshCw,
  HardDrive,
  Gamepad2,
  FolderOpen
} from 'lucide-react';
import type { GameCatalogItem, InstalledGame, DownloadProgress, GameStatus } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';

interface LibraryGridProps {
  catalog: GameCatalogItem[];
  installedGames: Record<string, InstalledGame>;
  gameStatuses: Record<string, GameStatus>;
  activeDownloads: Record<string, DownloadProgress>;
  onSelectGame: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
  onInstall: (gameId: string) => void;
  onOpenStore: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const LibraryGrid: React.FC<LibraryGridProps> = ({
  catalog,
  installedGames,
  gameStatuses,
  activeDownloads,
  onSelectGame,
  onLaunch,
  onInstall,
  onOpenStore,
  isRefreshing = false,
  onRefresh
}) => {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filterMode, setFilterMode] = useState<'all' | 'installed'>('all');

  // Compute total playtime
  const totalPlaytimeMinutes = useMemo(() => {
    return Object.values(installedGames).reduce((acc, curr) => acc + (curr.totalPlaytimeMinutes || 0), 0);
  }, [installedGames]);

  const formatTotalPlaytime = (mins: number) => {
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  };

  const formatPlaytime = (mins: number) => {
    if (mins === 0) return 'Never played';
    if (mins < 60) return `${mins}m played`;
    return `${(mins / 60).toFixed(1)}h played`;
  };

  const installedCount = useMemo(() => {
    return catalog.filter((g) => Boolean(installedGames[g.id]) || g.gameType === 'web').length;
  }, [catalog, installedGames]);

  const filteredGames = useMemo(() => {
    return catalog.filter((game) => {
      const isWeb = game.gameType === 'web';
      const isInstalled = Boolean(installedGames[game.id]) || isWeb;

      if (filterMode === 'installed' && !isInstalled) {
        return false;
      }

      const query = deferredSearch.trim().toLowerCase();
      const matchesSearch = !query ||
        game.title.toLowerCase().includes(query) ||
        game.description.toLowerCase().includes(query) ||
        game.genres.some((g) => g.toLowerCase().includes(query)) ||
        game.tags.some((t) => t.toLowerCase().includes(query));

      return matchesSearch;
    });
  }, [catalog, installedGames, filterMode, deferredSearch]);

  return (
    <div className="catalog-container">
      {/* Header section */}
      <div className="catalog-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="catalog-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Gamepad2 size={28} color="var(--accent-cyan)" />
            <span>My Game Library</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Your detected local games, instant cloud titles, and active studio collection.
          </p>
        </div>

        {/* Search Bar & Refresh Action */}
        <div className="catalog-actions-bar">
          <div className="search-input-box">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search your library..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {onRefresh && (
            <button
              className="btn-refresh"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh games, updates, and disk library"
              aria-label="Refresh games"
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin-fast' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Library Metrics & Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: '14px 18px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setFilterMode('all')}
            className={`btn-secondary ${filterMode === 'all' ? 'active' : ''}`}
            style={{
              height: 34,
              borderRadius: 20,
              fontSize: 12,
              padding: '0 16px',
              background: filterMode === 'all' ? 'rgba(0, 240, 255, 0.15)' : undefined,
              borderColor: filterMode === 'all' ? 'var(--accent-cyan)' : undefined,
              color: filterMode === 'all' ? 'var(--accent-cyan)' : undefined
            }}
          >
            All Games ({catalog.length})
          </button>

          <button
            onClick={() => setFilterMode('installed')}
            className={`btn-secondary ${filterMode === 'installed' ? 'active' : ''}`}
            style={{
              height: 34,
              borderRadius: 20,
              fontSize: 12,
              padding: '0 16px',
              background: filterMode === 'installed' ? 'rgba(0, 255, 136, 0.15)' : undefined,
              borderColor: filterMode === 'installed' ? 'var(--accent-green)' : undefined,
              color: filterMode === 'installed' ? 'var(--accent-green)' : undefined
            }}
          >
            Installed & Ready ({installedCount})
          </button>
        </div>

        {/* Quick Stats Summary */}
        <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HardDrive size={14} color="var(--accent-cyan)" />
            <span>Ready: <strong style={{ color: '#fff' }}>{installedCount}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="var(--accent-gold)" />
            <span>Total Playtime: <strong style={{ color: '#fff' }}>{formatTotalPlaytime(totalPlaytimeMinutes)}</strong></span>
          </div>
        </div>
      </div>

      {/* Games Grid */}
      {filteredGames.length > 0 ? (
        <div className="catalog-grid" style={{ marginTop: 24 }}>
          {filteredGames.map((game) => {
            const isComingSoon = Boolean(game.isComingSoon);
            const isWebGame = game.gameType === 'web';
            const installed = installedGames[game.id];
            const isDev = Boolean(installed?.version?.includes('Local Dev') || installed?.installPath?.includes('godot'));
            const isInstalled = Boolean(installed) || isWebGame;
            const rawStatus = gameStatuses[game.id];
            const status = (rawStatus === 'DOWNLOADING' || rawStatus === 'EXTRACTING' || rawStatus === 'RUNNING')
              ? rawStatus
              : (!isInstalled
                ? 'NOT_INSTALLED'
                : (rawStatus === 'UPDATE_AVAILABLE' && !installed?.version?.includes('Local Dev') ? 'UPDATE_AVAILABLE' : 'INSTALLED'));
            const isRunning = status === 'RUNNING';
            const isDownloading = status === 'DOWNLOADING' || status === 'EXTRACTING';
            const downloadProg = activeDownloads[game.id];

            return (
              <div
                key={game.id}
                className="game-card"
                onClick={() => onSelectGame(game.id)}
                style={{
                  border: isRunning
                    ? '1px solid #a855f7'
                    : isInstalled
                    ? '1px solid rgba(0, 255, 136, 0.3)'
                    : undefined
                }}
              >
                {/* Banner Thumbnail */}
                <div
                  className="card-banner"
                  style={{ backgroundImage: `url(${getAssetUrl(game.heroBanner)})` }}
                >
                  <div className="card-banner-overlay" />

                  {/* Top-Left Playtime Badge */}
                  {installed && installed.totalPlaytimeMinutes > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(10, 12, 19, 0.85)',
                        backdropFilter: 'blur(8px)',
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <Clock size={11} color="var(--accent-gold)" />
                      <span>{formatPlaytime(installed.totalPlaytimeMinutes)}</span>
                    </div>
                  )}

                  {/* Top-Right Status Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      display: 'flex',
                      gap: 6
                    }}
                  >
                    {isRunning ? (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(168, 85, 247, 0.25)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.5)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Sparkles size={11} className="animate-spin" /> Running
                      </span>
                    ) : isDownloading ? (
                      <span className="badge cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Download size={11} /> {status === 'EXTRACTING' ? 'Unpacking' : `${downloadProg?.percentage || 0}%`}
                      </span>
                    ) : isDev ? (
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.5)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ⚡ Dev Mode
                      </span>
                    ) : isComingSoon ? (
                      <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> Coming Soon
                      </span>
                    ) : (status === 'UPDATE_AVAILABLE' && !installedGames[game.id]?.version?.includes('Local Dev')) ? (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(255, 183, 0, 0.2)',
                          color: '#ffaa00',
                          border: '1px solid rgba(255, 183, 0, 0.4)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <RefreshCw size={11} /> Update Ready
                      </span>
                    ) : isInstalled ? (
                      <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {isWebGame ? <Globe size={11} /> : <CheckCircle size={11} />}
                        {isWebGame ? 'Instant Play' : 'Installed'}
                      </span>
                    ) : (
                      <span className="badge">v{game.version}</span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="card-title" style={{ fontSize: 18 }}>{game.title}</h3>
                  </div>

                  <p className="card-desc" style={{ fontSize: 12, minHeight: 34 }}>
                    {game.description.slice(0, 95)}...
                  </p>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0' }}>
                    {game.genres.slice(0, 2).map((g) => (
                      <span key={g} className="badge" style={{ fontSize: 10, padding: '2px 8px' }}>
                        {g}
                      </span>
                    ))}
                  </div>

                  {/* Card Footer with Quick Action */}
                  <div className="card-footer" style={{ marginTop: 8 }}>
                    <button
                      className="btn-secondary"
                      style={{ height: 34, padding: '0 12px', fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGame(game.id);
                      }}
                    >
                      Details
                    </button>

                    {/* Primary Button */}
                    {isRunning ? (
                      <button
                        className="btn-primary-action running"
                        style={{ height: 34, padding: '0 16px', fontSize: 12 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Sparkles size={14} className="animate-spin" /> Running
                      </button>
                    ) : isDev ? (
                      <button
                        className="btn-primary-action"
                        style={{
                          height: 34,
                          padding: '0 16px',
                          fontSize: 12,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          borderColor: '#34d399'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunch(game.id);
                        }}
                      >
                        <Play size={14} fill="#fff" /> Run (Dev)
                      </button>
                    ) : isComingSoon ? (
                      <button
                        className="btn-secondary"
                        style={{
                          height: 34,
                          padding: '0 14px',
                          fontSize: 12,
                          background: 'rgba(255, 170, 0, 0.12)',
                          borderColor: 'rgba(255, 170, 0, 0.4)',
                          color: '#ffaa00'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectGame(game.id);
                        }}
                      >
                        <Clock size={14} /> Coming Soon
                      </button>
                    ) : status === 'UPDATE_AVAILABLE' ? (
                      <button
                        className="btn-primary-action update"
                        style={{ height: 34, padding: '0 16px', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInstall(game.id);
                        }}
                      >
                        <RefreshCw size={14} /> Update
                      </button>
                    ) : isInstalled ? (
                      <button
                        className="btn-primary-action play"
                        style={{ height: 34, padding: '0 18px', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunch(game.id);
                        }}
                      >
                        <Play size={14} fill="currentColor" /> {installedGames[game.id]?.version?.includes('Local Dev') ? 'Play (Dev)' : 'Play Now'}
                      </button>
                    ) : (
                      <button
                        className="btn-primary-action install"
                        style={{ height: 34, padding: '0 16px', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInstall(game.id);
                        }}
                      >
                        <Download size={14} /> Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div
          style={{
            marginTop: 48,
            padding: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14
          }}
        >
          <Gamepad2 size={48} color="var(--text-muted)" />
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>No Games Found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 380 }}>
            {filterMode === 'installed'
              ? 'You do not have any installed games yet. Switch to "All Games" or visit Discover to get started.'
              : 'No games match your search query.'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {filterMode === 'installed' && (
              <button
                className="btn-secondary"
                onClick={() => setFilterMode('all')}
              >
                Show All Games
              </button>
            )}
            <button
              className="btn-primary-action install"
              style={{ height: 38, fontSize: 13, padding: '0 20px' }}
              onClick={onOpenStore}
            >
              Browse Discover Store
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
