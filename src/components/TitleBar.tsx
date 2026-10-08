import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, Wifi, Bell, RotateCcw, Download, Settings } from 'lucide-react';
import { launcherBridge } from '../services/electronBridge';
import type { LauncherConfig } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';

interface TitleBarProps {
  config: LauncherConfig;
  onOpenSettings: () => void;
  updateReadyVersion?: string | null;
  updateAvailableVersion?: string | null;
  updateReleaseUrl?: string | null;
  onRestartUpdate?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  config,
  onOpenSettings,
  updateReadyVersion,
  updateAvailableVersion,
  updateReleaseUrl,
  onRestartUpdate
}) => {
  const [online, setOnline] = useState(true);

  const isElectron = Boolean(launcherBridge.isElectron);
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
  const hasMacTrafficLights = isElectron && isMac;
  const showWindowsControls = !hasMacTrafficLights;

  const hasUpdate = Boolean(updateReadyVersion || updateAvailableVersion);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOpenReleasePage = () => {
    launcherBridge.openExternalUrl(updateReleaseUrl || 'https://github.com/inaayah/inaayah-launcher/releases/latest');
  };

  return (
    <div className="titlebar titlebar-drag">
      <div
        className="titlebar-left titlebar-no-drag"
        style={{ paddingLeft: hasMacTrafficLights ? 76 : 0 }}
      >
        <div className="studio-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={getAssetUrl('icon.png')} alt="Inaayah" style={{ width: 20, height: 20, borderRadius: 5, boxShadow: '0 0 10px rgba(0, 240, 255, 0.4)' }} />
          INAAYAH STUDIO
        </div>
        <span className="studio-badge">Launcher v0.2.0</span>
      </div>

      <div className="titlebar-center">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <Wifi size={13} color={online ? 'var(--accent-green)' : '#ff4444'} />
          <span>Nakama Backend:</span>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {config.nakamaHost}:{config.nakamaPort}
          </span>
          <ShieldCheck size={12} color="var(--accent-cyan)" />
        </div>
      </div>

      <div className="titlebar-right titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Update Notification Pill & Bell */}
        {updateReadyVersion ? (
          <button
            className="update-pill-btn ready"
            title="Update is downloaded! Click to restart launcher and apply"
            onClick={onRestartUpdate}
          >
            <RotateCcw size={12} className="spin-slow" />
            <span>Restart to Update (v{updateReadyVersion})</span>
          </button>
        ) : updateAvailableVersion ? (
          <button
            className="update-pill-btn available"
            title="A new launcher release is available on GitHub. Click to view installer"
            onClick={handleOpenReleasePage}
          >
            <Download size={12} />
            <span>v{updateAvailableVersion} Available</span>
          </button>
        ) : null}

        <button
          className={`titlebar-icon-btn ${hasUpdate ? 'active-update' : ''}`}
          title={hasUpdate ? (updateReadyVersion ? `Update v${updateReadyVersion} ready to install` : `New version v${updateAvailableVersion} available`) : 'Notifications'}
          onClick={hasUpdate ? (updateReadyVersion ? onRestartUpdate : handleOpenReleasePage) : onOpenSettings}
        >
          <Bell size={14} />
          {hasUpdate && <span className="bell-badge-pulse" />}
        </button>

        <button
          className="titlebar-icon-btn"
          title="Launcher Settings"
          onClick={onOpenSettings}
        >
          <Settings size={14} />
        </button>

        {showWindowsControls ? (
          <div className="titlebar-controls" style={{ marginLeft: 6 }}>
            <button
              className="window-btn"
              title="Minimize"
              onClick={() => launcherBridge.windowMinimize()}
            >
              <Minus size={14} />
            </button>
            <button
              className="window-btn"
              title="Maximize"
              onClick={() => launcherBridge.windowMaximize()}
            >
              <Square size={12} />
            </button>
            <button
              className="window-btn close"
              title="Close"
              onClick={() => launcherBridge.windowClose()}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ width: 10 }} />
        )}
      </div>
    </div>
  );
};
