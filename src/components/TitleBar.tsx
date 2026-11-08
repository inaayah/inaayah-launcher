import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, Wifi, Bell, RotateCcw, Download, Settings, Sun, Moon } from 'lucide-react';
import { launcherBridge } from '../services/electronBridge';
import type { LauncherConfig } from '../types/launcher';
import { getAssetUrl, getLocalBrandFallbackUrl } from '../utils/assets';
import { APP_VERSION } from '../utils/version';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'inaayah_theme';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore storage errors
  }
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

interface TitleBarProps {
  config: LauncherConfig;
  onOpenSettings: () => void;
  updateReadyVersion?: string | null;
  updateAvailableVersion?: string | null;
  updateReleaseUrl?: string | null;
  onRestartUpdate?: () => Promise<boolean | void> | void;
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
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [isRestarting, setIsRestarting] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const isElectron = Boolean(launcherBridge.isElectron);
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
  const hasMacTrafficLights = isElectron && isMac;
  const showWindowsControls = !hasMacTrafficLights;

  const hasUpdate = Boolean(updateReadyVersion || updateAvailableVersion);

  useEffect(() => {
    launcherBridge.getAppVersion().then((v) => {
      if (v) setAppVersion(v);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          const next: ThemeMode = e.matches ? 'light' : 'dark';
          setTheme(next);
          document.documentElement.setAttribute('data-theme', next);
        }
      } catch {
        // ignore
      }
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

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

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const themeTooltip =
    theme === 'dark'
      ? 'Switch to light theme'
      : 'Switch to dark theme';

  const handleOpenReleasePage = () => {
    launcherBridge.openExternalUrl(updateReleaseUrl || 'https://github.com/inaayah/inaayah-launcher/releases/latest');
  };

  const triggerRestartUpdate = async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    try {
      const ok = await onRestartUpdate?.();
      if (ok === false) {
        setIsRestarting(false);
      }
    } catch {
      setIsRestarting(false);
    }
  };

  return (
    <div className="titlebar titlebar-drag">
      <div
        className="titlebar-left titlebar-no-drag"
        style={{ paddingLeft: hasMacTrafficLights ? 76 : 0 }}
      >
        <div className="studio-logo">
          <img
            src={getAssetUrl('brand/inaayah-games-icon.png')}
            onError={(e) => {
              const step = e.currentTarget.dataset.fallbackApplied;
              if (!step) {
                e.currentTarget.dataset.fallbackApplied = '1';
                e.currentTarget.src = getLocalBrandFallbackUrl('inaayah-games-icon.png');
              } else if (step === '1') {
                e.currentTarget.dataset.fallbackApplied = '2';
                e.currentTarget.src = './icon.png';
              }
            }}
            alt="Inaayah Games"
            style={{ width: 22, height: 22, borderRadius: 6 }}
          />
          <span className="studio-logo-wordmark">
            <span>INAAYAH</span>
            <span className="studio-logo-division">GAMES</span>
          </span>
        </div>
        <span className="studio-badge" onClick={handleOpenReleasePage} style={{ cursor: 'pointer' }} title="View release notes">
          Launcher v{appVersion}
        </span>
      </div>

      <div className="titlebar-center">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <Wifi size={13} color={online ? 'var(--brand-accent)' : '#ef4444'} />
          <span>Nakama Backend:</span>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {config.nakamaHost}:{config.nakamaPort}
          </span>
          <ShieldCheck size={12} color="var(--brand-accent)" />
        </div>
      </div>

      <div className="titlebar-right titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Update Notification Pill & Bell */}
        {updateReadyVersion ? (
          <button
            className="update-pill-btn ready"
            title="Update is downloaded! Click to restart launcher and apply"
            disabled={isRestarting}
            onClick={triggerRestartUpdate}
          >
            <RotateCcw size={12} className="spin-slow" />
            <span>{isRestarting ? 'Restarting...' : `Restart to Update (v${updateReadyVersion})`}</span>
          </button>
        ) : updateAvailableVersion ? (
          <button
            className="update-pill-btn available"
            title="Click to download and install this launcher update automatically"
            disabled={isRestarting}
            onClick={triggerRestartUpdate}
          >
            {isRestarting ? <RotateCcw size={12} className="spin-fast" /> : <Download size={12} />}
            <span>{isRestarting ? `Downloading & Installing v${updateAvailableVersion}...` : `Update v${updateAvailableVersion}`}</span>
          </button>
        ) : null}

        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={themeTooltip}
          aria-label={themeTooltip}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <button
          className={`titlebar-icon-btn ${hasUpdate ? 'active-update' : ''}`}
          title={hasUpdate ? (updateReadyVersion ? `Update v${updateReadyVersion} ready to install` : `Update to v${updateAvailableVersion}`) : 'Notifications'}
          onClick={hasUpdate ? triggerRestartUpdate : onOpenSettings}
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
