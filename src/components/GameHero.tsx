import React, { useState } from 'react';
import {
  Play,
  Download,
  RefreshCw,
  FolderOpen,
  Trash2,
  Clock,
  HardDrive,
  Cpu,
  Monitor,
  CheckCircle2,
  Sparkles,
  Layers,
  Flame
} from 'lucide-react';
import type { GameCatalogItem, InstalledGame, DownloadProgress, GameStatus } from '../types/launcher';
import { launcherBridge } from '../services/electronBridge';

interface GameHeroProps {
  game: GameCatalogItem;
  installed?: InstalledGame;
  downloadProgress?: DownloadProgress;
  status: GameStatus;
  onInstall: (gameId: string) => void;
  onCancelDownload: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
  onUninstall: (gameId: string) => void;
  onCheckUpdates: (gameId: string) => void;
}

export const GameHero: React.FC<GameHeroProps> = ({
  game,
  installed,
  downloadProgress,
  status,
  onInstall,
  onCancelDownload,
  onLaunch,
  onUninstall,
  onCheckUpdates
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'changelog'>('overview');
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  const formatPlaytime = (mins: number) => {
    if (mins < 60) return `${mins} mins`;
    return `${(mins / 60).toFixed(1)} hrs`;
  };

  const formatLastPlayed = (ts: number | null) => {
    if (!ts) return 'Never';
    const diffHours = Math.floor((Date.now() - ts) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hrs ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  return (
    <div className="hero-container">
      {/* Banner Header */}
      <div
        className="hero-banner"
        style={{ backgroundImage: `url(${game.heroBanner})` }}
      >
        <div className="hero-overlay" />

        <div className="hero-content">
          <div className="hero-info">
            <div className="game-genre-badges">
              {game.genres.map((g, i) => (
                <span key={g} className={`badge ${i === 0 ? 'cyan' : i === 1 ? 'magenta' : ''}`}>
                  {g}
                </span>
              ))}
              <span className="badge">v{game.version}</span>
            </div>

            <h1 className="hero-title">{game.title}</h1>
            <p className="hero-subtitle">{game.subtitle}</p>

            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
              {installed && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={15} color="var(--accent-cyan)" />
                    <span>Playtime: <strong style={{ color: '#fff' }}>{formatPlaytime(installed.totalPlaytimeMinutes)}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Flame size={15} color="var(--accent-gold)" />
                    <span>Last Played: <strong style={{ color: '#fff' }}>{formatLastPlayed(installed.lastPlayedAt)}</strong></span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HardDrive size={15} color="var(--text-muted)" />
                <span>Size: <strong style={{ color: '#fff' }}>{game.sizeFormatted}</strong></span>
              </div>
            </div>
          </div>

          {/* Action Box */}
          <div className="hero-action-box">
            {status === 'NOT_INSTALLED' && (
              <button
                className="btn-primary-action install"
                onClick={() => onInstall(game.id)}
              >
                <Download size={20} />
                <span>Install Game</span>
              </button>
            )}

            {(status === 'DOWNLOADING' || status === 'EXTRACTING') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>
                    {status === 'EXTRACTING' ? 'Unpacking Files...' : `Downloading ${downloadProgress?.percentage || 0}%`}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {downloadProgress?.speedBytesPerSec
                      ? `${(downloadProgress.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                      : ''}
                  </span>
                </div>
                <div className="download-progress-bar">
                  <div
                    className="download-progress-fill"
                    style={{ width: `${downloadProgress?.percentage || 0}%` }}
                  />
                </div>
                <button
                  className="btn-secondary"
                  style={{ alignSelf: 'flex-end', height: 30, fontSize: 11 }}
                  onClick={() => onCancelDownload(game.id)}
                >
                  Cancel
                </button>
              </div>
            )}

            {status === 'UPDATE_AVAILABLE' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-primary-action update"
                  onClick={() => onInstall(game.id)}
                >
                  <RefreshCw size={18} />
                  <span>Update to v{game.version}</span>
                </button>
                <button
                  className="btn-primary-action play"
                  onClick={() => onLaunch(game.id)}
                >
                  <Play size={18} fill="currentColor" />
                  <span>Play</span>
                </button>
              </div>
            )}

            {status === 'INSTALLED' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-primary-action play"
                  onClick={() => onLaunch(game.id)}
                >
                  <Play size={20} fill="currentColor" />
                  <span>Play Now</span>
                </button>
              </div>
            )}

            {status === 'RUNNING' && (
              <button className="btn-primary-action running">
                <Sparkles size={18} className="animate-spin" />
                <span>Game is Running</span>
              </button>
            )}

            {/* Secondary Controls Bar for Installed Game */}
            {installed && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  className="btn-secondary"
                  title="Open Installation Folder"
                  onClick={() => launcherBridge.openFolder(installed.installPath)}
                >
                  <FolderOpen size={15} />
                  <span>Files</span>
                </button>
                <button
                  className="btn-secondary"
                  title="Check for Latest Updates"
                  onClick={() => onCheckUpdates(game.id)}
                >
                  <RefreshCw size={15} />
                  <span>Check Update</span>
                </button>
                <button
                  className="btn-secondary"
                  title="Uninstall Game"
                  style={{ color: '#ff6b81' }}
                  onClick={() => onUninstall(game.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="details-tabs-bar">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'requirements' ? 'active' : ''}`}
          onClick={() => setActiveTab('requirements')}
        >
          System Specs
        </button>
        <button
          className={`tab-btn ${activeTab === 'changelog' ? 'active' : ''}`}
          onClick={() => setActiveTab('changelog')}
        >
          Patch Notes ({game.changelog.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="section-box">
                <h3>About the Game</h3>
                <p style={{ lineHeight: 1.7, color: 'var(--text-secondary)', fontSize: 14 }}>
                  {game.description}
                </p>
              </div>

              <div className="section-box">
                <h3>Key Features</h3>
                <div className="features-grid">
                  {game.features.map((feat) => (
                    <div key={feat} className="feature-pill">
                      <CheckCircle2 size={16} color="var(--accent-cyan)" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-box">
                <h3>Screenshots & Gallery</h3>
                <div className="screenshots-strip">
                  {game.screenshots.map((shot, idx) => (
                    <div
                      key={idx}
                      className="screenshot-thumb"
                      style={{ backgroundImage: `url(${shot})` }}
                      onClick={() => setActiveScreenshot(shot)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Metadata Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="section-box">
                <h3>Details</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Developer</span>
                    <span style={{ fontWeight: 600 }}>{game.developer}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Release Date</span>
                    <span>{game.releaseDate}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Current Version</span>
                    <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      v{game.version}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Online Backend</span>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Nakama Cloud</span>
                  </div>
                </div>
              </div>

              <div className="section-box">
                <h3>Tags</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {game.tags.map((tag) => (
                    <span key={tag} className="badge">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'requirements' && (
          <div style={{ gridColumn: 'span 2' }}>
            <div className="section-box">
              <h3>System Requirements</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                  marginTop: 8
                }}
              >
                <div className="feature-pill">
                  <Monitor size={18} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>OS</div>
                    <strong>{game.requirements.os}</strong>
                  </div>
                </div>
                <div className="feature-pill">
                  <Cpu size={18} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Processor</div>
                    <strong>{game.requirements.cpu}</strong>
                  </div>
                </div>
                <div className="feature-pill">
                  <Layers size={18} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Graphics</div>
                    <strong>{game.requirements.gpu}</strong>
                  </div>
                </div>
                <div className="feature-pill">
                  <HardDrive size={18} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Memory & Storage</div>
                    <strong>{game.requirements.ram} RAM / {game.requirements.storage} Space</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'changelog' && (
          <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {game.changelog.map((entry) => (
              <div key={entry.version} className="section-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        background: 'rgba(0, 240, 255, 0.15)',
                        color: 'var(--accent-cyan)',
                        borderRadius: 6,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: 13
                      }}
                    >
                      v{entry.version}
                    </span>
                    <strong style={{ fontSize: 16 }}>{entry.title}</strong>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.date}</span>
                </div>
                <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
                  {entry.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Screenshot Lightbox Modal */}
      {activeScreenshot && (
        <div className="modal-overlay" onClick={() => setActiveScreenshot(null)}>
          <img
            src={activeScreenshot}
            alt="Screenshot"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)'
            }}
          />
        </div>
      )}
    </div>
  );
};
