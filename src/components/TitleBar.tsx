import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, Wifi } from 'lucide-react';
import { launcherBridge } from '../services/electronBridge';
import type { LauncherConfig } from '../types/launcher';

interface TitleBarProps {
  config: LauncherConfig;
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ config }) => {
  const [online, setOnline] = useState(true);

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
      <div className="titlebar-left titlebar-no-drag">
        <div className="studio-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7L12 12L22 7L12 2Z"
              stroke="#00f0ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 17L12 22L22 17"
              stroke="#ff0055"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 12L12 17L22 12"
              stroke="#00f0ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          INAAYAH STUDIO
        </div>
        <span className="studio-badge">Launcher v1.0</span>
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
    </div>
  );
};
