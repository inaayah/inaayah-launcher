import type { LauncherUser, StudioAnalyticsOverview } from '../types/launcher';
import { APP_VERSION } from '../utils/version';
import { launcherBridge } from './electronBridge';

const STORAGE_TOKEN_KEY = 'inaayah_auth_token';
const STORAGE_USER_KEY = 'inaayah_auth_user';
const STORAGE_DEVICE_ID_KEY = 'inaayah_device_id';
const STORAGE_LOCAL_USERS_KEY = 'inaayah_local_users_v1';
const STORAGE_LOCAL_OTPS_KEY = 'inaayah_local_otps_v1';
const STORAGE_LOCAL_DOWNLOADS_KEY = 'inaayah_local_downloads_v1';

const DEFAULT_GATEWAY = 'https://releases.inaayah.dev';
const DEFAULT_ADMIN_EMAILS = ['sazid@inaayah.dev', 'admin@inaayah.dev'];
const DEFAULT_SENDER = 'Inaayah Studio <noreply@inaayah.dev>';

export interface AuthActionResult {
  status: 'AUTHENTICATED' | 'VERIFICATION_REQUIRED' | 'RESET_CODE_SENT';
  user?: LauncherUser;
  token?: string;
  email?: string;
  sender?: string;
  delivery?: 'email' | 'preview';
  devOtpCode?: string;
  message?: string;
}

interface StoredLocalUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'admin' | 'player';
  emailVerified: boolean;
  createdAt: string;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  platform: string;
  appVersion: string;
}

function detectPlatform(): 'darwin' | 'win32' | 'linux' | 'web' {
  if (typeof navigator === 'undefined') return 'darwin';
  const ua = navigator.userAgent.toLowerCase();
  if (!launcherBridge.isElectron) return 'web';
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('linux')) return 'linux';
  return 'darwin';
}

export function getDeviceId(): string {
  try {
    let existing = localStorage.getItem(STORAGE_DEVICE_ID_KEY);
    if (!existing) {
      existing = `dev_${crypto.randomUUID()}`;
      localStorage.setItem(STORAGE_DEVICE_ID_KEY, existing);
    }
    return existing;
  } catch {
    return 'dev_ephemeral';
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): LauncherUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LauncherUser;
    if (parsed && parsed.emailVerified) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveAuthSession(token: string, user: LauncherUser): void {
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
  } catch {}
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  } catch {}
}

async function resolveGatewayUrl(override?: string): Promise<string> {
  if (override) return override.replace(/\/+$/, '');
  try {
    const cfg = await launcherBridge.getConfig();
    if (cfg.releaseGatewayUrl) {
      return cfg.releaseGatewayUrl.replace(/\/+$/, '');
    }
  } catch {}
  return DEFAULT_GATEWAY;
}

async function sha256Client(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getLocalUsers(): Record<string, StoredLocalUser> {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLocalUsers(users: Record<string, StoredLocalUser>): void {
  try {
    localStorage.setItem(STORAGE_LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

function getLocalOtps(): Record<string, { code: string; purpose: string; expiresAt: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_OTPS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLocalOtps(otps: Record<string, { code: string; purpose: string; expiresAt: number }>): void {
  try {
    localStorage.setItem(STORAGE_LOCAL_OTPS_KEY, JSON.stringify(otps));
  } catch {}
}

function generateLocalOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function isLocalAdminEmail(email: string): boolean {
  return DEFAULT_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const authService = {
  async register(
    emailRaw: string,
    password: string,
    displayNameRaw: string,
    gatewayUrl?: string
  ): Promise<AuthActionResult> {
    const email = emailRaw.trim().toLowerCase();
    const displayName = displayNameRaw.trim();
    const base = await resolveGatewayUrl(gatewayUrl);
    const appVersion = await launcherBridge.getAppVersion().catch(() => APP_VERSION);
    const platform = detectPlatform();

    try {
      const res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName,
          deviceId: getDeviceId(),
          platform,
          appVersion
        })
      });

      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Registration failed (HTTP ${res.status})`);
        }
        return data as AuthActionResult;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    // Local preview fallback when Worker has not yet been deployed with /api/auth/*
    const users = getLocalUsers();
    const existing = users[email];
    if (existing && existing.emailVerified) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    const passwordHash = await sha256Client(`inay_salt:${email}:${password}`);
    const nowIso = new Date().toISOString();
    users[email] = {
      id: existing?.id || crypto.randomUUID(),
      email,
      displayName,
      passwordHash,
      role: isLocalAdminEmail(email) ? 'admin' : 'player',
      emailVerified: false,
      createdAt: existing?.createdAt || nowIso,
      verifiedAt: null,
      lastSeenAt: nowIso,
      platform,
      appVersion
    };
    saveLocalUsers(users);

    const code = generateLocalOtp();
    const otps = getLocalOtps();
    otps[email] = { code, purpose: 'verify_email', expiresAt: Date.now() + 15 * 60 * 1000 };
    saveLocalOtps(otps);

    return {
      status: 'VERIFICATION_REQUIRED',
      email,
      sender: DEFAULT_SENDER,
      delivery: 'preview',
      devOtpCode: code,
      message: `A 6-digit verification code has been generated for ${email}.`
    };
  },

  async verifyEmail(emailRaw: string, codeRaw: string, gatewayUrl?: string): Promise<AuthActionResult> {
    const email = emailRaw.trim().toLowerCase();
    const code = codeRaw.trim();
    const base = await resolveGatewayUrl(gatewayUrl);
    const appVersion = await launcherBridge.getAppVersion().catch(() => APP_VERSION);
    const platform = detectPlatform();

    try {
      const res = await fetch(`${base}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          deviceId: getDeviceId(),
          platform,
          appVersion
        })
      });

      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Invalid or expired verification code.');
        }
        if (data.token && data.user) {
          saveAuthSession(data.token, data.user);
        }
        return data as AuthActionResult;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    // Local preview fallback
    const users = getLocalUsers();
    const user = users[email];
    if (!user) throw new Error('Account not found. Please sign up first.');

    const otps = getLocalOtps();
    const otp = otps[email];
    if (!otp || otp.purpose !== 'verify_email' || otp.expiresAt < Date.now()) {
      throw new Error('Verification code has expired. Please request a new 6-digit code.');
    }
    if (otp.code !== code) {
      throw new Error('Invalid 6-digit verification code. Please try again.');
    }

    delete otps[email];
    saveLocalOtps(otps);

    const nowIso = new Date().toISOString();
    user.emailVerified = true;
    user.verifiedAt = user.verifiedAt || nowIso;
    user.lastSeenAt = nowIso;
    if (isLocalAdminEmail(email)) user.role = 'admin';
    saveLocalUsers(users);

    const publicUser: LauncherUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: true,
      createdAt: user.createdAt,
      verifiedAt: user.verifiedAt,
      lastSeenAt: user.lastSeenAt
    };
    const token = `inay_local_${crypto.randomUUID()}`;
    saveAuthSession(token, publicUser);

    return {
      status: 'AUTHENTICATED',
      token,
      user: publicUser
    };
  },

  async resendCode(
    emailRaw: string,
    purpose: 'verify_email' | 'reset_password' = 'verify_email',
    gatewayUrl?: string
  ): Promise<{ sender: string; delivery: 'email' | 'preview'; devOtpCode?: string; message: string }> {
    const email = emailRaw.trim().toLowerCase();
    const base = await resolveGatewayUrl(gatewayUrl);

    try {
      const res = await fetch(`${base}/api/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose })
      });
      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not resend verification code.');
        return data;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    const code = generateLocalOtp();
    const otps = getLocalOtps();
    otps[email] = { code, purpose, expiresAt: Date.now() + 15 * 60 * 1000 };
    saveLocalOtps(otps);

    return {
      sender: DEFAULT_SENDER,
      delivery: 'preview',
      devOtpCode: code,
      message: `A fresh 6-digit verification code was generated for ${email}.`
    };
  },

  async login(emailRaw: string, password: string, gatewayUrl?: string): Promise<AuthActionResult> {
    const email = emailRaw.trim().toLowerCase();
    const base = await resolveGatewayUrl(gatewayUrl);
    const appVersion = await launcherBridge.getAppVersion().catch(() => APP_VERSION);
    const platform = detectPlatform();

    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          deviceId: getDeviceId(),
          platform,
          appVersion
        })
      });

      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
          return {
            status: 'VERIFICATION_REQUIRED',
            email: data.email || email,
            sender: data.sender || DEFAULT_SENDER,
            delivery: data.delivery || 'email',
            devOtpCode: data.devOtpCode,
            message: data.error
          };
        }
        if (!res.ok) {
          throw new Error(data.error || 'Invalid email or password.');
        }
        if (data.token && data.user) {
          saveAuthSession(data.token, data.user);
        }
        return data as AuthActionResult;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    // Local preview fallback
    const users = getLocalUsers();
    const user = users[email];
    const expectedHash = await sha256Client(`inay_salt:${email}:${password}`);
    if (!user || user.passwordHash !== expectedHash) {
      throw new Error('Invalid email or password.');
    }

    if (!user.emailVerified) {
      const code = generateLocalOtp();
      const otps = getLocalOtps();
      otps[email] = { code, purpose: 'verify_email', expiresAt: Date.now() + 15 * 60 * 1000 };
      saveLocalOtps(otps);
      return {
        status: 'VERIFICATION_REQUIRED',
        email,
        sender: DEFAULT_SENDER,
        delivery: 'preview',
        devOtpCode: code,
        message: 'Your account email is not verified yet. Please enter the 6-digit verification code.'
      };
    }

    user.lastSeenAt = new Date().toISOString();
    if (isLocalAdminEmail(email)) user.role = 'admin';
    saveLocalUsers(users);

    const publicUser: LauncherUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: true,
      createdAt: user.createdAt,
      verifiedAt: user.verifiedAt,
      lastSeenAt: user.lastSeenAt
    };
    const token = `inay_local_${crypto.randomUUID()}`;
    saveAuthSession(token, publicUser);

    return {
      status: 'AUTHENTICATED',
      token,
      user: publicUser
    };
  },

  async forgotPassword(emailRaw: string, gatewayUrl?: string): Promise<AuthActionResult> {
    const email = emailRaw.trim().toLowerCase();
    const base = await resolveGatewayUrl(gatewayUrl);

    try {
      const res = await fetch(`${base}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not request password reset.');
        return data as AuthActionResult;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    const users = getLocalUsers();
    if (!users[email]) {
      throw new Error('No account found with that email address.');
    }
    const code = generateLocalOtp();
    const otps = getLocalOtps();
    otps[email] = { code, purpose: 'reset_password', expiresAt: Date.now() + 15 * 60 * 1000 };
    saveLocalOtps(otps);

    return {
      status: 'RESET_CODE_SENT',
      email,
      sender: DEFAULT_SENDER,
      delivery: 'preview',
      devOtpCode: code,
      message: `A 6-digit password reset code was generated for ${email}.`
    };
  },

  async resetPassword(
    emailRaw: string,
    codeRaw: string,
    newPassword: string,
    gatewayUrl?: string
  ): Promise<AuthActionResult> {
    const email = emailRaw.trim().toLowerCase();
    const code = codeRaw.trim();
    const base = await resolveGatewayUrl(gatewayUrl);

    try {
      const res = await fetch(`${base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      });
      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not reset password.');
        if (data.token && data.user) {
          saveAuthSession(data.token, data.user);
        }
        return data as AuthActionResult;
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    const users = getLocalUsers();
    const user = users[email];
    if (!user) throw new Error('Account not found.');

    const otps = getLocalOtps();
    const otp = otps[email];
    if (!otp || otp.purpose !== 'reset_password' || otp.expiresAt < Date.now() || otp.code !== code) {
      throw new Error('Invalid or expired 6-digit reset code.');
    }
    delete otps[email];
    saveLocalOtps(otps);

    user.passwordHash = await sha256Client(`inay_salt:${email}:${newPassword}`);
    user.emailVerified = true;
    user.verifiedAt = user.verifiedAt || new Date().toISOString();
    user.lastSeenAt = new Date().toISOString();
    if (isLocalAdminEmail(email)) user.role = 'admin';
    saveLocalUsers(users);

    const publicUser: LauncherUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: true,
      createdAt: user.createdAt,
      verifiedAt: user.verifiedAt,
      lastSeenAt: user.lastSeenAt
    };
    const token = `inay_local_${crypto.randomUUID()}`;
    saveAuthSession(token, publicUser);

    return {
      status: 'AUTHENTICATED',
      token,
      user: publicUser
    };
  },

  async verifySession(gatewayUrl?: string): Promise<LauncherUser | null> {
    const token = getStoredToken();
    const cached = getStoredUser();
    if (!token || !cached) return null;

    const base = await resolveGatewayUrl(gatewayUrl);
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data?.user && data.user.emailVerified) {
          saveAuthSession(token, data.user);
          return data.user as LauncherUser;
        }
      } else if (res.status === 401 || res.status === 403) {
        clearAuthSession();
        return null;
      }
    } catch {
      // Offline mode: keep verified cached session, but never trust an unverified admin role escalation offline
    }

    if (cached.role === 'admin' && !isLocalAdminEmail(cached.email)) {
      return { ...cached, role: 'player' };
    }

    return cached;
  },

  async logout(gatewayUrl?: string): Promise<void> {
    const token = getStoredToken();
    clearAuthSession();
    if (!token) return;
    const base = await resolveGatewayUrl(gatewayUrl);
    try {
      await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  },

  async sendHeartbeat(
    eventType: 'app_launch' | 'heartbeat' | 'game_download' | 'game_launch' = 'heartbeat',
    extra?: { gameId?: string; gameVersion?: string },
    gatewayUrl?: string
  ): Promise<void> {
    const base = await resolveGatewayUrl(gatewayUrl);
    const token = getStoredToken();
    const appVersion = await launcherBridge.getAppVersion().catch(() => APP_VERSION);
    const platform = detectPlatform();

    if ((eventType === 'game_download' || eventType === 'game_launch') && extra?.gameId) {
      try {
        const raw = localStorage.getItem(STORAGE_LOCAL_DOWNLOADS_KEY);
        const map: Record<string, number> = raw ? JSON.parse(raw) : {};
        map[extra.gameId] = (map[extra.gameId] || 0) + 1;
        localStorage.setItem(STORAGE_LOCAL_DOWNLOADS_KEY, JSON.stringify(map));
      } catch {}
    }

    try {
      await fetch(`${base}/api/telemetry/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          platform,
          appVersion,
          eventType,
          ...(extra || {})
        }),
        signal: AbortSignal.timeout(4000)
      });
    } catch {}
  },

  async getAnalyticsOverview(gatewayUrl?: string): Promise<StudioAnalyticsOverview> {
    const token = getStoredToken();
    const currentUser = getStoredUser();
    if (!token || !currentUser) {
      throw new Error('Authentication required.');
    }
    if (currentUser.role !== 'admin') {
      throw new Error('Forbidden: Detailed studio analytics are only available to the studio administrator.');
    }

    const base = await resolveGatewayUrl(gatewayUrl);
    try {
      const res = await fetch(`${base}/api/analytics/overview`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000)
      });
      if (res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to load analytics (HTTP ${res.status})`);
        }
        return data as StudioAnalyticsOverview;
      }
    } catch (err: any) {
      if (
        err?.message &&
        !err.message.includes('Failed to fetch') &&
        !err.message.includes('NetworkError') &&
        !err.message.includes('timed out')
      ) {
        throw err;
      }
    }

    // Fallback when Worker hasn't been redeployed with /api/analytics/overview yet:
    // Fetch live GitHub Release download counts from the existing Worker endpoints + local users!
    let launcherGhDownloads = 0;
    try {
      const relRes = await fetch(`${base}/api/launcher/latest`, { signal: AbortSignal.timeout(4000) });
      if (relRes.ok) {
        const rel = await relRes.json();
        if (Array.isArray(rel?.assets)) {
          launcherGhDownloads = rel.assets.reduce(
            (sum: number, a: any) => sum + (Number(a.downloadCount) || 0),
            0
          );
        }
      }
    } catch {}

    const gameTargets: Array<{
      gameId: string;
      title: string;
      gameType: 'desktop' | 'web';
      webUrl?: string;
    }> = [
      { gameId: 'vigilante-red-city', title: 'Vigilante: Red City', gameType: 'desktop' },
      { gameId: 'aether-rush', title: 'AetherRush: Cyber Brawler 3D', gameType: 'desktop' },
      {
        gameId: 'kettle-court',
        title: 'Kettle Court: Court of Kettle',
        gameType: 'web',
        webUrl: 'https://kettle-court.inaayah.dev'
      }
    ];

    let localDownloadsMap: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(STORAGE_LOCAL_DOWNLOADS_KEY);
      if (raw) localDownloadsMap = JSON.parse(raw);
    } catch {}

    const gameMetrics = await Promise.all(
      gameTargets.map(async (g) => {
        let version = '1.0.0';
        let githubDownloads = 0;
        let onlinePlayers: number | undefined = undefined;
        if (g.gameType === 'web' && g.webUrl) {
          try {
            const r = await fetch(`${g.webUrl}/api/stats`, {
              signal: AbortSignal.timeout(3000)
            });
            if (r.ok) {
              const d = await r.json();
              if (typeof d?.version === 'string') version = d.version.replace(/^v/, '');
              githubDownloads = Number(d?.totalPlays ?? d?.totalSessions ?? d?.uniquePlayers) || 0;
              if (typeof d?.onlineNow === 'number' || typeof d?.activePlayers === 'number') {
                onlinePlayers = Number(d?.onlineNow ?? d?.activePlayers) || 0;
              }
            }
          } catch {}
        } else {
          try {
            const r = await fetch(`${base}/api/games/${g.gameId}/releases/latest`, {
              signal: AbortSignal.timeout(4000)
            });
            if (r.ok) {
              const d = await r.json();
              version = (d?.version || '1.0.0').replace(/^v/, '');
              if (Array.isArray(d?.assets)) {
                githubDownloads = d.assets.reduce(
                  (sum: number, a: any) => sum + (Number(a.downloadCount) || 0),
                  0
                );
              }
            }
          } catch {}
        }
        const trackedDownloads = localDownloadsMap[g.gameId] || 0;
        return {
          gameId: g.gameId,
          title: g.title,
          version,
          gameType: g.gameType,
          githubDownloads,
          trackedDownloads,
          totalDownloads: githubDownloads + trackedDownloads,
          ...(typeof onlinePlayers === 'number' ? { onlinePlayers } : {})
        };
      })
    );

    const localUsersList = Object.values(getLocalUsers());
    const verifiedList = localUsersList.filter((u) => u.emailVerified);
    const platform = detectPlatform();
    const appVersion = await launcherBridge.getAppVersion().catch(() => APP_VERSION);

    return {
      generatedAt: new Date().toISOString(),
      senderEmail: DEFAULT_SENDER,
      isLocalFallback: true,
      summary: {
        totalLauncherDownloads: Math.max(launcherGhDownloads, 1),
        githubReleaseDownloads: launcherGhDownloads,
        trackedLauncherDownloads: 1,
        uniqueDevices: Math.max(verifiedList.length, 1),
        registeredUsers: Math.max(localUsersList.length, 1),
        verifiedUsers: Math.max(verifiedList.length, 1),
        unverifiedUsers: localUsersList.filter((u) => !u.emailVerified).length,
        onlineNow: 1,
        dau: Math.max(verifiedList.length, 1),
        mau: Math.max(verifiedList.length, 1),
        totalGameDownloads: gameMetrics.reduce((s, m) => s + m.totalDownloads, 0)
      },
      platformBreakdown: {
        darwin: platform === 'darwin' ? 1 : 0,
        win32: platform === 'win32' ? 1 : 0,
        linux: platform === 'linux' ? 1 : 0,
        web: platform === 'web' ? 1 : 0
      },
      versionBreakdown: [{ version: appVersion, count: 1 }],
      gameMetrics,
      recentUsers: localUsersList.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        verifiedAt: u.verifiedAt,
        lastSeenAt: u.lastSeenAt,
        platform: u.platform,
        appVersion: u.appVersion,
        isOnline: u.id === currentUser.id
      }))
    };
  }
};
