import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  Download,
  Users,
  Activity,
  Gamepad2,
  RefreshCw,
  ShieldCheck,
  Laptop,
  CheckCircle2,
  Clock,
  Mail,
  AlertCircle
} from 'lucide-react';
import { authService } from '../services/authService';
import type { LauncherUser, StudioAnalyticsOverview } from '../types/launcher';

interface StudioAnalyticsProps {
  currentUser: LauncherUser;
  gatewayUrl?: string;
}

export const StudioAnalytics: React.FC<StudioAnalyticsProps> = ({ currentUser, gatewayUrl }) => {
  const [data, setData] = useState<StudioAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await authService.getAnalyticsOverview(gatewayUrl);
      setData(overview);
    } catch (err: any) {
      setError(err?.message || 'Failed to load studio analytics.');
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl]);

  useEffect(() => {
    loadAnalytics();
    const timer = window.setInterval(loadAnalytics, 30000);
    return () => clearInterval(timer);
  }, [loadAnalytics]);

  if (currentUser.role !== 'admin') {
    return (
      <div className="analytics-view">
        <div className="analytics-restricted-card">
          <AlertCircle size={32} color="#ff4444" />
          <h2>Restricted Access</h2>
          <p>Detailed studio analytics are only accessible to verified studio administrator accounts.</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const totalDevices = Math.max(
    1,
    (data?.platformBreakdown.darwin || 0) +
      (data?.platformBreakdown.win32 || 0) +
      (data?.platformBreakdown.linux || 0) +
      (data?.platformBreakdown.web || 0)
  );

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <div>
          <div className="analytics-kicker">
            <ShieldCheck size={14} color="var(--accent-cyan)" />
            <span>STUDIO OWNER TELEMETRY • ADMIN ONLY ({currentUser.email})</span>
          </div>
          <h1 className="analytics-title">Launcher Downloads & Player Analytics</h1>
          <p className="analytics-subtitle">
            Real-time metrics combining Cloudflare D1 account telemetry, active device heartbeats, and GitHub Release downloads.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data?.senderEmail && (
            <div className="analytics-sender-pill" title="Configured OTP Sender Identity">
              <Mail size={13} color="var(--accent-cyan)" />
              <span>OTP Sender: {data.senderEmail}</span>
            </div>
          )}
          <button
            className="btn-secondary"
            onClick={loadAnalytics}
            disabled={loading}
            style={{ height: 38, padding: '0 16px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin-fast' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {data?.isLocalFallback && (
        <div className="analytics-notice-banner">
          <div>
            <strong>Cloudflare Worker Update Pending Deployment:</strong> Showing live GitHub Release download counts + local preview accounts. Run{' '}
            <code>npm run deploy:worker</code> to activate global Cloudflare D1 telemetry on{' '}
            <code>releases.inaayah.dev</code>.
          </div>
        </div>
      )}

      {error && (
        <div className="auth-alert error" style={{ marginBottom: 20 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Top 4 KPI Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">Launcher Downloads</span>
            <div className="analytics-kpi-icon cyan">
              <Download size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? summary.totalLauncherDownloads.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>{summary?.githubReleaseDownloads ?? 0} GitHub Releases</span>
            <span>•</span>
            <span>{summary?.uniqueDevices ?? 0} Unique Devices</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">Verified Accounts</span>
            <div className="analytics-kpi-icon green">
              <Users size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? summary.verifiedUsers.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>{summary?.registeredUsers ?? 0} Total Sign-Ups</span>
            <span>•</span>
            <span>{summary?.unverifiedUsers ?? 0} Pending OTP</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">Active Players</span>
            <div className="analytics-kpi-icon magenta">
              <Activity size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">
            {summary ? summary.onlineNow.toLocaleString() : '—'}
            <span className="analytics-live-dot" title="Active in last 5 minutes">
              LIVE
            </span>
          </div>
          <div className="analytics-kpi-meta">
            <span>DAU (24h): {summary?.dau ?? 0}</span>
            <span>•</span>
            <span>MAU (30d): {summary?.mau ?? 0}</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">Total Game Downloads</span>
            <div className="analytics-kpi-icon cyan">
              <Gamepad2 size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? summary.totalGameDownloads.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>Across {data?.gameMetrics.length ?? 0} Released Studio Titles</span>
          </div>
        </div>
      </div>

      {/* Middle Row: Per-Game Downloads & OS Platform Distribution */}
      <div className="analytics-two-col">
        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <BarChart3 size={16} color="var(--accent-cyan)" />
            <h3>Game Downloads & Web Sessions</h3>
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Game Title</th>
                  <th>Latest Release</th>
                  <th>CDN / Web Plays</th>
                  <th>Launcher Plays</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data?.gameMetrics || []).map((g) => (
                  <tr key={g.gameId}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{g.title}</span>
                        {g.gameType === 'web' && (
                          <span
                            className="role-pill admin"
                            style={{ fontSize: 9, padding: '1px 6px' }}
                            title="Browser-based Web Game"
                          >
                            WEB
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="studio-badge">v{g.version}</span>
                    </td>
                    <td className="mono">
                      {g.githubDownloads.toLocaleString()}
                      {typeof g.onlinePlayers === 'number' && g.onlinePlayers > 0 && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: 'var(--accent-green)'
                          }}
                        >
                          ({g.onlinePlayers} online)
                        </span>
                      )}
                    </td>
                    <td className="mono">{g.trackedDownloads.toLocaleString()}</td>
                    <td className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      {g.totalDownloads.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <Laptop size={16} color="var(--accent-cyan)" />
            <h3>Active Devices by Operating System</h3>
          </div>

          <div className="analytics-os-list">
            {[
              { key: 'darwin', label: 'macOS (Apple Silicon / Intel)', count: data?.platformBreakdown.darwin || 0 },
              { key: 'win32', label: 'Windows (64-bit)', count: data?.platformBreakdown.win32 || 0 },
              { key: 'linux', label: 'Linux (AppImage / x86_64)', count: data?.platformBreakdown.linux || 0 },
              { key: 'web', label: 'Web Browser Client', count: data?.platformBreakdown.web || 0 }
            ].map((item) => {
              const pct = Math.round((item.count / totalDevices) * 100);
              return (
                <div key={item.key} className="analytics-os-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{item.label}</span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>
                      {item.count} ({item.count > 0 ? pct : 0}%)
                    </span>
                  </div>
                  <div className="analytics-bar-track">
                    <div
                      className="analytics-bar-fill"
                      style={{ width: `${item.count > 0 ? Math.max(6, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Panel: Verified Users & Recent Sign-Ups */}
      <div className="analytics-panel" style={{ marginTop: 20 }}>
        <div className="analytics-panel-header">
          <Users size={16} color="var(--accent-cyan)" />
          <h3>Registered & Verified Launcher Accounts</h3>
        </div>
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>Verification</th>
                <th>OS / Version</th>
                <th>Status / Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentUsers || []).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                    No registered users found yet.
                  </td>
                </tr>
              ) : (
                (data?.recentUsers || []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.displayName}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {u.email}
                    </td>
                    <td>
                      <span className={`role-pill ${u.role === 'admin' ? 'admin' : 'player'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {u.emailVerified ? (
                        <span className="verified-pill yes">
                          <CheckCircle2 size={12} /> Verified
                        </span>
                      ) : (
                        <span className="verified-pill no">
                          <Clock size={12} /> Pending OTP
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {u.platform || '—'} {u.appVersion ? `• v${u.appVersion}` : ''}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {u.isOnline ? (
                        <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>● Online Now</span>
                      ) : u.lastSeenAt ? (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {new Date(u.lastSeenAt).toLocaleString()}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
