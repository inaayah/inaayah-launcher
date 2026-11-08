import React, { useState, useMemo, useDeferredValue, useRef } from 'react';
import { ArrowUpRight, ChevronDown, Clock, Download, Globe, LoaderCircle, Play, Plus, RotateCw, Search } from 'lucide-react';
import type { GameCatalogItem, InstalledGame, GameStatus } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';
import { settledGameStatus } from '../utils/gameStatus';

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

const FEATURED_GAME_ID = 'vigilante-red-city';

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
  const [selectedGenre, setSelectedGenre] = useState('All');
  const genrePicker = useRef<HTMLDetailsElement>(null);
  const genreSummary = useRef<HTMLElement>(null);

  const genres = useMemo(() => {
    const labels = new Map<string, string>();
    for (const game of catalog) {
      for (const label of game.genres) {
        const key = label.toLowerCase();
        if (!labels.has(key)) labels.set(key, label);
      }
    }
    return ['All', ...labels.values()];
  }, [catalog]);
  const genre = genres.includes(selectedGenre) ? selectedGenre : 'All';
  const filteredGames = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const genreKey = genre.toLowerCase();
    return catalog.filter(game => {
      const matchesSearch = !query || game.title.toLowerCase().includes(query) ||
        game.description.toLowerCase().includes(query) || game.tags.some(tag => tag.toLowerCase().includes(query));
      return matchesSearch && (genre === 'All' || game.genres.some(label => label.toLowerCase() === genreKey));
    });
  }, [catalog, deferredSearch, genre]);

  const featured = genre === 'All' && !search.trim() && !deferredSearch.trim()
    ? filteredGames.find(game => game.id === FEATURED_GAME_ID && !game.isComingSoon)
    : undefined;
  const remaining = filteredGames.filter(game => game.id !== featured?.id);

  const renderAction = (game: GameCatalogItem, featuredAction = false) => {
    const installed = installedGames[game.id];
    const status = gameStatuses[game.id] ?? settledGameStatus(game, installed);
    const isDev = Boolean(installed?.version?.includes('Local Dev') || installed?.installPath?.includes('godot'));
    const isWeb = game.gameType === 'web';

    let label: string;
    let Icon = Play;
    let variant = 'play';
    let action: (() => void) | undefined;

    if (status === 'DOWNLOADING' || status === 'EXTRACTING' || status === 'RUNNING') {
      label = status === 'DOWNLOADING' ? 'Downloading' : status === 'EXTRACTING' ? 'Installing' : 'Running';
      Icon = LoaderCircle;
      variant = 'running';
    } else if (game.isComingSoon && !isDev) {
      label = 'Coming soon';
      Icon = Clock;
      variant = 'coming-soon';
      action = () => onSelectGame(game.id);
    } else if (status === 'UPDATE_AVAILABLE' && !isDev) {
      label = 'Update';
      Icon = Download;
      variant = 'update';
      action = () => onInstall(game.id);
    } else if (installed || isWeb) {
      label = isDev ? 'Run (Dev)' : isWeb ? 'Instant play' : featuredAction ? 'Play now' : 'Play';
      Icon = isWeb ? Globe : Play;
      action = () => onLaunch(game.id);
    } else {
      label = 'Install';
      Icon = Download;
      variant = 'install';
      action = () => onInstall(game.id);
    }

    return (
      <button
        type="button"
        className={`btn-primary-action discover-game-action ${variant}`}
        disabled={!action}
        onClick={event => { event.stopPropagation(); action?.(); }}
      >
        <Icon size={15} aria-hidden="true" /> {label}
      </button>
    );
  };

  const canAddToLibrary = (game: GameCatalogItem) =>
    !game.isComingSoon && game.gameType !== 'web' && !installedGames[game.id] && !ownedGameIds.includes(game.id);

  const renderAddButton = (game: GameCatalogItem) => (
    <button
      type="button"
      className="discover-text-action"
      aria-label={`Add ${game.title} to My Library`}
      onClick={event => { event.stopPropagation(); onAddToLibrary(game.id); }}
    >
      <Plus size={15} aria-hidden="true" /> Add to library
    </button>
  );

  return (
    <div className="catalog-container discover-catalog">
      <header className="catalog-header">
        <h1 className="catalog-title">Discover</h1>
        <div className="catalog-actions-bar">
          <label className="search-input-box">
            <Search size={16} color="var(--text-muted)" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search games"
              placeholder="Search games…"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
          {onRefresh && (
            <button
              type="button"
              className="btn-refresh"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh store catalog"
            >
              <RotateCw size={14} className={isRefreshing ? 'spin-fast' : ''} aria-hidden="true" />
              <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </header>

      {featured && (
        <section className="discover-feature" aria-label="Featured release">
          <div className="discover-feature-copy">
            <p className="discover-feature-kicker">Featured release</p>
            <h2>{featured.title}</h2>
            <p className="discover-feature-description">
              Fight through Red City as Murat, Zeynep, or Emir. Play solo or team up in local or online co-op.
            </p>
            <p className="discover-feature-meta">
              v{featured.version}{featured.sizeBytes > 0 && ` · ${featured.sizeFormatted}`}
            </p>
            <div className="discover-feature-actions">
              {renderAction(featured, true)}
              <button type="button" className="discover-text-action" onClick={() => onSelectGame(featured.id)}>
                Game details <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </div>
            {canAddToLibrary(featured) && renderAddButton(featured)}
          </div>
          <figure className="discover-feature-art">
            <img src={getAssetUrl(featured.heroBanner)} alt={`${featured.title} artwork`} />
          </figure>
        </section>
      )}

      <section className="discover-browse" aria-labelledby="discover-browse-title">
        <h2 id="discover-browse-title">{featured ? 'More from Inaayah Games' : 'Browse games'}</h2>
        <details className="discover-genre-picker" ref={genrePicker}>
          <summary ref={genreSummary} className="btn-secondary" aria-label={`Filter by genre, ${genre === 'All' ? 'all genres' : genre}`}>
            {genre === 'All' ? 'All genres' : genre} <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="catalog-filter-bar" role="group" aria-label="Game genres">
            {genres.map(option => (
              <button
                key={option}
                type="button"
                className="discover-filter"
                aria-pressed={genre === option}
                onClick={() => {
                  setSelectedGenre(option);
                  if (genrePicker.current) genrePicker.current.open = false;
                  genreSummary.current?.focus();
                }}
              >
                {option === 'All' ? 'All genres' : option}
              </button>
            ))}
          </div>
        </details>
        <div className="catalog-grid">
          {remaining.map(game => (
            <article key={game.id} className="game-card" onClick={() => onSelectGame(game.id)}>
              <div className="card-banner" style={{ backgroundImage: `url(${getAssetUrl(game.heroBanner)})` }} />
              <div className="card-body">
                <h3 className="card-title">
                  <button type="button" onClick={event => { event.stopPropagation(); onSelectGame(game.id); }}>
                    {game.title}
                  </button>
                </h3>
                <p className="card-desc">{game.description}</p>
                <div className="discover-card-specs">
                  {[...game.genres.slice(0, 2), game.gameType === 'web' ? 'Browser game' : `v${game.version}`].join(' · ')}
                </div>
                <div className="card-footer">
                  {renderAction(game)}
                  {canAddToLibrary(game) && renderAddButton(game)}
                </div>
              </div>
            </article>
          ))}
        </div>
        {filteredGames.length === 0 && <p className="discover-empty" role="status">No games match these filters.</p>}
      </section>
    </div>
  );
};
