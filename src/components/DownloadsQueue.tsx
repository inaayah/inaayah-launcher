import React from 'react';
import { Download, XCircle, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import type { GameCatalogItem, DownloadProgress } from '../types/launcher';

interface DownloadsQueueProps {
  catalog: GameCatalogItem[];
  downloads: Record<string, DownloadProgress>;
  onCancel: (gameId: string) => void;
  onSelectGame: (gameId: string) => void;
}

export const DownloadsQueue: React.FC<DownloadsQueueProps> = ({
  catalog,
  downloads,
  onCancel,
  onSelectGame
}) => {
  const downloadEntries = Object.entries(downloads);

  const getGame = (id: string) => catalog.find((g) => g.id === id);

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0.0 MB/s';
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatETA = (seconds: number) => {
    if (!seconds || seconds <= 0) return '--';
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s remaining`;
  };

  const formatMB = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="downloads-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="catalog-title">Downloads & Updates</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Monitor active package transfers and asset unpack operations.
          </p>
        </div>
      </div>

      {downloadEntries.length === 0 ? (
        <div
          className="section-box"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)'
          }}
        >
          <Download size={42} style={{ opacity: 0.3, marginBottom: 12 }} />
          <h3>No Active Downloads</h3>
          <p style={{ fontSize: 13, maxWidth: 360, marginTop: 6 }}>
            All your installed games are up to date! Check the Store to discover and install new titles.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {downloadEntries.map(([gameId, p]) => {
            const game = getGame(gameId);
            const isCompleted = p.phase === 'COMPLETED';
            const isError = p.phase === 'ERROR';
            const isExtracting = p.phase === 'EXTRACTING';

            return (
              <div
                key={gameId}
                className={`download-card ${!isCompleted ? 'active' : ''}`}
                onClick={() => onSelectGame(gameId)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        backgroundImage: `url(${game?.coverArt || ''})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: '1px solid var(--border-subtle)'
                      }}
                    />
                    <div>
                      <h4 style={{ fontSize: 16, fontWeight: 700 }}>
                        {game?.title || gameId}
                      </h4>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, marginTop: 3 }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {formatMB(p.bytesReceived)} / {formatMB(p.totalBytes)}
                        </span>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                          {p.percentage}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {isExtracting ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-gold)' }}>
                            <Layers size={14} /> Extracting Game Assets...
                          </span>
                        ) : isCompleted ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-green)' }}>
                            <CheckCircle2 size={14} /> Completed
                          </span>
                        ) : isError ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ff4444' }}>
                            <AlertTriangle size={14} /> Failed: {p.errorMsg || 'Network error'}
                          </span>
                        ) : (
                          formatSpeed(p.speedBytesPerSec)
                        )}
                      </div>
                      {!isExtracting && !isCompleted && !isError && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatETA(p.etaSeconds)}
                        </div>
                      )}
                    </div>

                    {!isCompleted && (
                      <button
                        className="btn-secondary"
                        style={{ height: 32, padding: '0 10px', color: '#ff6b81' }}
                        title="Cancel Download"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancel(gameId);
                        }}
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="download-progress-bar">
                  <div
                    className="download-progress-fill"
                    style={{
                      width: `${p.percentage}%`,
                      background: isError
                        ? '#ff4444'
                        : isCompleted
                        ? 'var(--accent-green)'
                        : isExtracting
                        ? 'var(--accent-gold)'
                        : undefined
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
