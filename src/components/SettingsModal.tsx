import React, { useState } from 'react';
import { X, FolderOpen, Save, Check } from 'lucide-react';
import type { LauncherConfig } from '../types/launcher';
import { launcherBridge } from '../services/electronBridge';

interface SettingsModalProps {
  config: LauncherConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: Partial<LauncherConfig>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave
}) => {
  const [libraryPath, setLibraryPath] = useState(config.libraryPath);
  const [autoUpdate, setAutoUpdate] = useState(config.autoUpdate);
  const [closeOnStart, setCloseOnStart] = useState(config.closeLauncherOnGameStart);
  const [nakamaHost, setNakamaHost] = useState(config.nakamaHost);
  const [nakamaPort, setNakamaPort] = useState(config.nakamaPort);
  const [useSSL, setUseSSL] = useState(config.useSSL);
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    const selected = await launcherBridge.browseDirectory();
    if (selected) {
      setLibraryPath(selected);
    }
  };

  const handleSave = () => {
    onSave({
      libraryPath,
      autoUpdate,
      closeLauncherOnGameStart: closeOnStart,
      nakamaHost,
      nakamaPort: Number(nakamaPort),
      useSSL
    });
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 600);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Launcher Settings</h2>
          <button className="window-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Game Library Location</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
            />
            <button className="btn-secondary" onClick={handleBrowse}>
              <FolderOpen size={16} />
              <span>Browse</span>
            </button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            All downloaded games, patches, and asset packs will be stored here.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">General Preferences</label>

          <label className="toggle-switch" style={{ padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Automatic Updates</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Keep games automatically updated to latest GitHub Releases.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoUpdate}
              onChange={(e) => setAutoUpdate(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-cyan)' }}
            />
          </label>

          <label className="toggle-switch" style={{ padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Close Launcher When Game Starts</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Frees system RAM and GPU resources while playing.
              </div>
            </div>
            <input
              type="checkbox"
              checked={closeOnStart}
              onChange={(e) => setCloseOnStart(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-cyan)' }}
            />
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Multiplayer Backend (Nakama)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Host / IP"
              value={nakamaHost}
              onChange={(e) => setNakamaHost(e.target.value)}
            />
            <input
              type="number"
              className="form-input"
              placeholder="Port"
              value={nakamaPort}
              onChange={(e) => setNakamaPort(Number(e.target.value))}
            />
          </div>

          <label className="toggle-switch" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Use SSL / TLS Encryption</span>
            <input
              type="checkbox"
              checked={useSSL}
              onChange={(e) => setUseSSL(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent-cyan)' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary-action play"
            style={{ height: 40, padding: '0 24px', fontSize: 13 }}
            onClick={handleSave}
          >
            {savedFeedback ? (
              <>
                <Check size={16} /> Saved!
              </>
            ) : (
              <>
                <Save size={16} /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
