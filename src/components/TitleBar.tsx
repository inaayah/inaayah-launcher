import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, Wifi } from 'lucide-react';
import { launcherBridge } from '../services/electronBridge';
import type { LauncherConfig } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';

interface TitleBarProps {
  config: LauncherConfig;
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ config }) => {
  const [online, setOnline] = useState(true);

  const isElectron = Boolean(launcherBridge.isElectron);
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
  // In Electron on macOS, native traffic light buttons are rendered at top-left.
  const hasMacTrafficLights = isElectron && isMac;
  const showWindowsControls = !hasMacTrafficLights;

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

      {showWindowsControls ? (
        <div className="titlebar-controls titlebar-no-drag">
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
        <div style={{ width: 40 }} />
      )}
    </div>
  );
};
