import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  AlertCircle,
  Calendar
} from 'lucide-react';
import { authService } from '../services/authService';
import type { LauncherUser, StudioAnalyticsOverview, AnalyticsPeriodBucket } from '../types/launcher';

interface StudioAnalyticsProps {
  currentUser: LauncherUser;
  gatewayUrl?: string;
}

type TimeframeWindow = 'today' | 'month' | 'all';
type BreakdownCadence = 'daily' | 'monthly';

export const StudioAnalytics: React.FC<StudioAnalyticsProps> = ({ currentUser, gatewayUrl }) => {
  const [data, setData] = useState<StudioAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeWindow>('all');
  const [cadence, setCadence] = useState<BreakdownCadence>('daily');

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
  }, [loadAnalytics]);

  const activeBuckets: AnalyticsPeriodBucket[] = useMemo(() => {
    if (!data) return [];
    return cadence === 'daily' ? data.dailyBreakdown || [] : data.monthlyBreakdown || [];
  }, [data, cadence]);

  const bucketTotals = useMemo(() => {
    return activeBuckets.reduce(
      (acc, b) => {
        acc.totalPlays += b.totalPlays;
        acc.webPlays += b.webPlays;
        acc.launcherPlays += b.launcherPlays;
        acc.newUsers += b.newUsers;
        acc.newInstalls += b.newInstalls;
        return acc;
      },
      { totalPlays: 0, webPlays: 0, launcherPlays: 0, newUsers: 0, newInstalls: 0 }
    );
  }, [activeBuckets]);

  const maxBucketPlays = useMemo(() => {
    return Math.max(1, ...activeBuckets.map((b) => b.totalPlays));
  }, [activeBuckets]);

  if (currentUser.role !== 'admin') {
    return (
      <div className="analytics-view">
        <div className="analytics-restricted-card">
          <AlertCircle size={32} color="#ef4444" />
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

  const kpiLauncherDownloads =
    timeframe === 'today'
      ? summary?.todayNewInstalls ?? 0
      : timeframe === 'month'
      ? summary?.monthNewInstalls ?? 0
      : summary?.totalLauncherDownloads ?? 0;

  const kpiVerifiedUsers =
    timeframe === 'today'
      ? summary?.todayNewUsers ?? 0
      : timeframe === 'month'
      ? summary?.monthNewUsers ?? 0
      : summary?.verifiedUsers ?? 0;

  const kpiActivePlayers =
    timeframe === 'today'
      ? summary?.dau ?? 0
      : timeframe === 'month'
      ? summary?.mau ?? 0
      : summary?.onlineNow ?? 0;

  const kpiGameActivity =
    timeframe === 'today'
      ? summary?.todayPlays ?? 0
      : timeframe === 'month'
      ? summary?.monthPlays ?? 0
      : summary?.totalGameDownloads ?? 0;

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <div>
          <div className="analytics-kicker">
            <ShieldCheck size={14} color="var(--brand-accent)" />
            <span>STUDIO OWNER TELEMETRY • ADMIN ONLY ({currentUser.email})</span>
          </div>
          <h1 className="analytics-title">Launcher Downloads & Player Analytics</h1>
          <p className="analytics-subtitle">
            Real-time metrics combining Cloudflare D1 account telemetry, daily/monthly session breakdowns, and GitHub Release downloads.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Mobbin Segmented Timeframe Pill Bar */}
          <div className="analytics-timeframe-pills" role="tablist" aria-label="Analytics timeframe">
            <button
              type="button"
              role="tab"
              aria-selected={timeframe === 'today'}
              className={`analytics-timeframe-pill ${timeframe === 'today' ? 'active' : ''}`}
              onClick={() => setTimeframe('today')}
            >
              Today (UTC)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeframe === 'month'}
              className={`analytics-timeframe-pill ${timeframe === 'month' ? 'active' : ''}`}
              onClick={() => setTimeframe('month')}
            >
              This Month
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeframe === 'all'}
              className={`analytics-timeframe-pill ${timeframe === 'all' ? 'active' : ''}`}
              onClick={() => setTimeframe('all')}
            >
              All Time
            </button>
          </div>

          {data?.senderEmail && (
            <div className="analytics-sender-pill" title="Configured OTP Sender Identity">
              <Mail size={13} color="var(--brand-accent)" />
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
            <strong>Cloudflare Worker Update Pending Deployment:</strong> Showing live GitHub Release download counts + local preview accounts. Push to{' '}
            <code>main</code> to activate global Cloudflare D1 telemetry on{' '}
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
            <span className="analytics-kpi-label">
              {timeframe === 'today'
                ? 'New Devices Today'
                : timeframe === 'month'
                ? 'New Devices This Month'
                : 'Launcher Downloads'}
            </span>
            <div className="analytics-kpi-icon cyan">
              <Download size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? kpiLauncherDownloads.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>+{summary?.todayNewInstalls ?? 0} today</span>
            <span>•</span>
            <span>+{summary?.monthNewInstalls ?? 0} this month</span>
            <span>•</span>
            <span>{summary?.uniqueDevices ?? 0} devices</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">
              {timeframe === 'today'
                ? 'Sign-Ups Today'
                : timeframe === 'month'
                ? 'Sign-Ups This Month'
                : 'Verified Accounts'}
            </span>
            <div className="analytics-kpi-icon green">
              <Users size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? kpiVerifiedUsers.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>+{summary?.todayNewUsers ?? 0} today</span>
            <span>•</span>
            <span>+{summary?.monthNewUsers ?? 0} this month</span>
            <span>•</span>
            <span>{summary?.registeredUsers ?? 0} total</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-top">
            <span className="analytics-kpi-label">
              {timeframe === 'today'
                ? 'Daily Active (24h)'
                : timeframe === 'month'
                ? 'Monthly Active (30d)'
                : 'Active Players'}
            </span>
            <div className="analytics-kpi-icon magenta">
              <Activity size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">
            {summary ? kpiActivePlayers.toLocaleString() : '—'}
            <span className="analytics-live-dot" title="Active in last 5 minutes">
              {summary?.onlineNow ?? 0} LIVE
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
            <span className="analytics-kpi-label">
              {timeframe === 'today'
                ? 'Plays & Installs Today'
                : timeframe === 'month'
                ? 'Plays & Installs (Month)'
                : 'Total Game Activity'}
            </span>
            <div className="analytics-kpi-icon cyan">
              <Gamepad2 size={18} />
            </div>
          </div>
          <div className="analytics-kpi-value">{summary ? kpiGameActivity.toLocaleString() : '—'}</div>
          <div className="analytics-kpi-meta">
            <span>+{summary?.todayPlays ?? 0} today</span>
            <span>•</span>
            <span>+{summary?.monthPlays ?? 0} this month</span>
          </div>
        </div>
      </div>

      {/* Per-Day (14D) & Per-Month (6M) Activity Breakdown Panel (Mintlify / Vimeo Mobbin Pattern) */}
      <div className="analytics-trend-panel">
        <div className="analytics-trend-header">
          <div className="analytics-panel-header-left">
            <Calendar size={16} color="var(--brand-accent)" />
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {cadence === 'daily'
                  ? 'Daily Activity Breakdown (Last 14 UTC Days)'
                  : 'Monthly Activity Breakdown (Last 6 UTC Months)'}
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Tracked web arcade sessions, desktop launcher plays/downloads, new device installs, and verified sign-ups per {cadence === 'daily' ? 'day' : 'month'}.
              </span>
            </div>
          </div>

          <div className="analytics-timeframe-pills" role="tablist" aria-label="Breakdown cadence">
            <button
              type="button"
              role="tab"
              aria-selected={cadence === 'daily'}
              className={`analytics-timeframe-pill ${cadence === 'daily' ? 'active' : ''}`}
              onClick={() => setCadence('daily')}
            >
              Daily (14D)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cadence === 'monthly'}
              className={`analytics-timeframe-pill ${cadence === 'monthly' ? 'active' : ''}`}
              onClick={() => setCadence('monthly')}
            >
              Monthly (6M)
            </button>
          </div>
        </div>

        {/* Window Summary Strip */}
        <div className="analytics-period-summary-strip">
          <div className="analytics-period-summary-box">
            <span className="analytics-period-summary-label">
              {cadence === 'daily' ? '14-Day Total Plays' : '6-Month Total Plays'}
            </span>
            <span className="analytics-period-summary-val">{bucketTotals.totalPlays.toLocaleString()}</span>
          </div>
          <div className="analytics-period-summary-box">
            <span className="analytics-period-summary-label">Web Arcade Plays</span>
            <span className="analytics-period-summary-val" style={{ color: 'var(--brand-accent)' }}>
              {bucketTotals.webPlays.toLocaleString()}
            </span>
          </div>
          <div className="analytics-period-summary-box">
            <span className="analytics-period-summary-label">Launcher Plays & Installs</span>
            <span className="analytics-period-summary-val" style={{ color: 'var(--brand-amber)' }}>
              {bucketTotals.launcherPlays.toLocaleString()}
            </span>
          </div>
          <div className="analytics-period-summary-box">
            <span className="analytics-period-summary-label">New Devices / Sign-Ups</span>
            <span className="analytics-period-summary-val">
              {bucketTotals.newInstalls.toLocaleString()} / {bucketTotals.newUsers.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Stacked Bar Chart */}
        {activeBuckets.length > 0 && (
          <>
            <div className="analytics-bar-chart" role="img" aria-label={`${cadence} activity bar chart`}>
              {activeBuckets.map((b) => {
                const totalHeightPct = b.totalPlays > 0 ? Math.max(8, Math.round((b.totalPlays / maxBucketPlays) * 100)) : 4;
                const webRatio = b.totalPlays > 0 ? Math.round((b.webPlays / b.totalPlays) * 100) : 0;
                const launcherRatio = b.totalPlays > 0 ? 100 - webRatio : 0;

                return (
                  <div
                    key={b.key}
                    className="analytics-bar-col"
                    title={`${b.label} (${b.key})\nTotal Plays: ${b.totalPlays}\nWeb Plays: ${b.webPlays}\nLauncher Plays: ${b.launcherPlays}\nNew Devices: ${b.newInstalls}\nVerified Sign-Ups: ${b.newUsers}`}
                  >
                    <span className="analytics-bar-count">{b.totalPlays > 0 ? b.totalPlays : ''}</span>
                    <div className="analytics-bar-stack" style={{ height: `${totalHeightPct}%` }}>
                      {b.webPlays > 0 && (
                        <div className="analytics-bar-segment web" style={{ height: `${webRatio}%` }} />
                      )}
                      {b.launcherPlays > 0 && (
                        <div className="analytics-bar-segment launcher" style={{ height: `${launcherRatio}%` }} />
                      )}
                    </div>
                    <span className="analytics-bar-label">{b.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="analytics-legend">
              <span className="analytics-legend-item">
                <span className="analytics-legend-Swatch" style={{ background: 'var(--brand-accent)' }} />
                <span>Web Arcade Plays</span>
              </span>
              <span className="analytics-legend-item">
                <span className="analytics-legend-Swatch" style={{ background: 'var(--brand-amber)' }} />
                <span>Desktop Launcher Plays & Downloads</span>
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Hover any bar for daily/monthly device & sign-up counts
              </span>
            </div>
          </>
        )}
      </div>

      {/* Middle Row: Per-Game Downloads & OS Platform Distribution */}
      <div className="analytics-two-col">
        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-header-left">
              <BarChart3 size={16} color="var(--brand-accent)" />
              <h3>Game Downloads & Web Sessions</h3>
            </div>
            <span className="studio-badge">
              {timeframe === 'today' ? 'Today (UTC)' : timeframe === 'month' ? 'This Month (UTC)' : 'All-Time + Period Breakdown'}
            </span>
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Game Title</th>
                  <th>Release</th>
                  <th>Today (UTC)</th>
                  <th>This Month</th>
                  <th>CDN / Web</th>
                  <th>Launcher</th>
                  <th>All-Time</th>
                </tr>
              </thead>
              <tbody>
                {(data?.gameMetrics || []).map((g) => {
                  const todayCount = g.todayDownloads ?? 0;
                  const monthCount = g.monthDownloads ?? 0;
                  return (
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
                      <td
                        className="mono"
                        style={{
                          color: timeframe === 'today' || todayCount > 0 ? 'var(--brand-accent)' : undefined,
                          fontWeight: timeframe === 'today' ? 700 : 500
                        }}
                      >
                        +{todayCount.toLocaleString()}
                      </td>
                      <td
                        className="mono"
                        style={{
                          color: timeframe === 'month' ? 'var(--brand-accent)' : 'var(--text-primary)',
                          fontWeight: timeframe === 'month' ? 700 : 500
                        }}
                      >
                        +{monthCount.toLocaleString()}
                      </td>
                      <td className="mono">
                        {g.githubDownloads.toLocaleString()}
                        {typeof g.onlinePlayers === 'number' && g.onlinePlayers > 0 && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: 'var(--brand-accent)'
                            }}
                          >
                            ({g.onlinePlayers} live)
                          </span>
                        )}
                      </td>
                      <td className="mono">{g.trackedDownloads.toLocaleString()}</td>
                      <td className="mono" style={{ color: 'var(--brand-accent)', fontWeight: 700 }}>
                        {g.totalDownloads.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-header-left">
              <Laptop size={16} color="var(--brand-accent)" />
              <h3>Active Devices by Operating System</h3>
            </div>
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
          <div className="analytics-panel-header-left">
            <Users size={16} color="var(--brand-accent)" />
            <h3>Registered & Verified Launcher Accounts</h3>
          </div>
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
                        <span style={{ color: 'var(--brand-accent)', fontWeight: 600 }}>● Online Now</span>
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
