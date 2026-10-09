import React, { useState, useMemo, useDeferredValue } from 'react';
import { Search, Download, Play, CheckCircle, Globe, Clock, BookmarkCheck, Plus, RotateCw, Sparkles } from 'lucide-react';
import type { GameCatalogItem, InstalledGame, GameStatus } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';

interface StoreCatalogProps {
  catalog: GameCatalogItem[];
  installedGames: Record<string, InstalledGame>;
  gameStatuses?: Record<string, GameStatus>;
  ownedGameIds: string[];
  onSelectGame: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
  onInstall: (gameId: string) => void;
  onAddToLibrary: (gameId: string) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const StoreCatalog: React.FC<StoreCatalogProps> = ({
  catalog,
  installedGames,
  gameStatuses = {},
  ownedGameIds,
  onSelectGame,
  onLaunch,
  onInstall,
  onAddToLibrary,
  isRefreshing = false,
  onRefresh
}) => {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  const genres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((g) => g.genres.forEach((genre) => set.add(genre)));
    return ['All', ...Array.from(set)];
  }, [catalog]);

  const filteredGames = useMemo(() => {
    return catalog.filter((game) => {
      const query = deferredSearch.trim().toLowerCase();
      const matchesSearch = !query ||
        game.title.toLowerCase().includes(query) ||
        game.description.toLowerCase().includes(query) ||
        game.tags.some((t) => t.toLowerCase().includes(query));

      const matchesGenre =
        selectedGenre === 'All' || game.genres.includes(selectedGenre);

      return matchesSearch && matchesGenre;
    });
  }, [catalog, deferredSearch, selectedGenre]);

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <div>
          <h2 className="catalog-title">Inaayah Studio Store</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Explore official releases, multiplayer titles, and instant web games.
          </p>
        </div>

        <div className="catalog-actions-bar">
          <div className="search-input-box">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search catalog or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {onRefresh && (
            <button
              className="btn-refresh"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh store catalog from network"
              aria-label="Refresh store catalog"
            >
              <RotateCw size={14} className={isRefreshing ? 'spin-fast' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Genre Pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {genres.map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGenre(g)}
            className={`btn-secondary ${selectedGenre === g ? 'active' : ''}`}
            style={{
              height: 32,
              borderRadius: 20,
              fontSize: 12,
              background: selectedGenre === g ? 'rgba(0, 240, 255, 0.15)' : undefined,
              borderColor: selectedGenre === g ? 'var(--accent-cyan)' : undefined,
              color: selectedGenre === g ? 'var(--accent-cyan)' : undefined
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="catalog-grid">
        {filteredGames.map((game) => {
          const isComingSoon = Boolean(game.isComingSoon);
          const isWebGame = game.gameType === 'web';
          const installed = installedGames[game.id];
          const isDev = Boolean(installed?.version?.includes('Local Dev') || installed?.installPath?.includes('godot'));
          const isInLibrary = ownedGameIds.includes(game.id) || Boolean(installed);
          const isInstalled = Boolean(installed) || isWebGame;
          const isRunning = gameStatuses[game.id] === 'RUNNING';

          return (
            <div
              key={game.id}
              className="game-card"
              onClick={() => onSelectGame(game.id)}
            >
              <div
                className="card-banner"
                style={{ backgroundImage: `url(${getAssetUrl(game.heroBanner)})` }}
              >
                <div className="card-banner-overlay" />
                {isDev ? (
                  <div style={{ position: 'absolute', top: 12, left: 12 }}>
                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.5)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ⚡ Local Dev Mode
                    </span>
                  </div>
                ) : isInLibrary && !isComingSoon && (
                  <div style={{ position: 'absolute', top: 12, left: 12 }}>
                    <span className="badge" style={{ background: 'rgba(0, 240, 255, 0.2)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 240, 255, 0.4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <BookmarkCheck size={11} /> In Library
                    </span>
                  </div>
                )}
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
                  ) : isDev ? (
                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.5)' }}>
                      Dev Ready
                    </span>
                  ) : isComingSoon ? (
                    <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> Coming Soon
                    </span>
                  ) : isInstalled ? (
                    <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {isWebGame ? <Globe size={11} /> : <CheckCircle size={11} />}
                      {isWebGame ? 'Instant Play' : 'Installed'}
                    </span>
                  ) : (
                    <span className="badge cyan">v{game.version}</span>
                  )}
                </div>
              </div>

              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="card-title">{game.title}</h3>
                  {isRunning ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c084fc', fontSize: 12, fontWeight: 600 }}>
                      <Sparkles size={13} className="animate-spin" /> Running
                    </span>
                  ) : isDev ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#34d399', fontSize: 12, fontWeight: 600 }}>
                      ⚡ Dev Active
                    </span>
                  ) : isComingSoon ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ffaa00', fontSize: 12, fontWeight: 600 }}>
                      <Clock size={13} /> In Dev
                    </span>
                  ) : isInstalled ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-green)', fontSize: 12, fontWeight: 600 }}>
                      <CheckCircle size={14} /> {isWebGame ? 'Ready' : 'Installed'}
                    </span>
                  ) : !isInLibrary ? (
                    <button
                      className="btn-secondary"
                      style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToLibrary(game.id);
                      }}
                      title="Add to My Library"
                    >
                      <Plus size={12} /> Add
                    </button>
                  ) : null}
                </div>

                <p className="card-desc">{game.description.slice(0, 110)}...</p>

                <div className="card-footer">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {game.genres.slice(0, 2).map((g) => (
                      <span key={g} className="badge">
                        {g}
                      </span>
                    ))}
                  </div>

                  {isRunning ? (
                    <button
                      className="btn-primary-action running"
                      style={{ height: 34, padding: '0 14px', fontSize: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Sparkles size={13} className="animate-spin" /> Running
                    </button>
                  ) : isDev ? (
                    <button
                      className="btn-primary-action"
                      style={{
                        height: 34,
                        padding: '0 14px',
                        fontSize: 12,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        borderColor: '#34d399'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunch(game.id);
                      }}
                    >
                      <Play size={13} fill="#fff" /> Run (Dev)
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
                  ) : isWebGame ? (
                    <button
                      className="btn-secondary"
                      style={{
                        height: 34,
                        padding: '0 14px',
                        fontSize: 12,
                        background: 'rgba(0, 255, 136, 0.15)',
                        borderColor: 'var(--accent-green)',
                        color: 'var(--accent-green)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunch(game.id);
                      }}
                    >
                      <Globe size={14} /> Instant Play
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      style={{
                        height: 34,
                        padding: '0 14px',
                        fontSize: 12,
                        background: isInstalled ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 240, 255, 0.15)',
                        borderColor: isInstalled ? 'var(--accent-green)' : 'var(--accent-cyan)',
                        color: isInstalled ? 'var(--accent-green)' : 'var(--accent-cyan)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isInstalled) {
                          onLaunch(game.id);
                        } else {
                          onInstall(game.id);
                        }
                      }}
                    >
                      {isInstalled ? (
                        <>
                          <Play size={14} fill="currentColor" /> Play
                        </>
                      ) : (
                        <>
                          <Download size={14} /> {game.sizeFormatted}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
