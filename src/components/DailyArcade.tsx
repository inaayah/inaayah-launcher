import React, { useState } from 'react';
import { Gamepad2, Home, RotateCw, ExternalLink, AppWindow } from 'lucide-react';
import { launcherBridge } from '../services/electronBridge';

const ARCADE_HUB_URL = 'https://arcade.inaayah.dev/';

export const DailyArcade: React.FC = () => {
  const [iframeKey, setIframeKey] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(ARCADE_HUB_URL);
  const [isLoading, setIsLoading] = useState(true);

  const handleReturnHub = () => {
    setIsLoading(true);
    setCurrentUrl(ARCADE_HUB_URL);
    setIframeKey((prev) => prev + 1);
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handlePopOutWindow = () => {
    launcherBridge.launchWebGame('inaayah-arcade', ARCADE_HUB_URL);
  };

  const handleOpenExternal = () => {
    launcherBridge.openExternalUrl(ARCADE_HUB_URL);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-base)'
      }}
    >
      {/* Compact Launcher Control Bar for Embedded Arcade */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'rgba(59, 130, 246, 0.14)',
              border: '1px solid rgba(59, 130, 246, 0.36)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60A5FA',
              flexShrink: 0
            }}
          >
            <Gamepad2 size={15} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Inaayah Daily Arcade
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                padding: '2px 7px',
                borderRadius: 999,
                background: 'var(--bg-subtle-box)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              arcade.inaayah.dev
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={handleReturnHub}
            title="Return to Arcade Hub (All Daily Games)"
          >
            <Home size={12} />
            <span>Arcade Hub</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={handleReload}
            title="Reload Arcade"
          >
            <RotateCw size={12} className={isLoading ? 'spin-fast' : ''} />
            <span>Reload</span>
          </button>

          {launcherBridge.isElectron && (
            <button
              type="button"
              className="btn-secondary"
              style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={handlePopOutWindow}
              title="Open Daily Arcade in a standalone window"
            >
              <AppWindow size={12} />
              <span>Pop Out</span>
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={handleOpenExternal}
            title="Open arcade.inaayah.dev in system browser"
          >
            <ExternalLink size={12} />
            <span>Browser</span>
          </button>
        </div>
      </div>

      {/* Embedded Arcade Webview */}
      <div style={{ position: 'relative', flex: 1, width: '100%', minHeight: 0 }}>
        <iframe
          key={iframeKey}
          src={currentUrl}
          title="Inaayah Daily Arcade"
          allow="clipboard-write; clipboard-read; autoplay"
          onLoad={() => setIsLoading(false)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: 'var(--bg-base)'
          }}
        />
      </div>
    </div>
  );
};
