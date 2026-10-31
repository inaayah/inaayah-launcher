export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = Record<string, any>>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
  all<T = Record<string, any>>(): Promise<{ results: T[] }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch?(statements: D1PreparedStatement[]): Promise<any[]>;
  exec?(query: string): Promise<any>;
}

export interface AuthAnalyticsEnv {
  DB?: D1DatabaseLike;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  ADMIN_EMAILS?: string;
  ALLOW_DEV_OTP_PREVIEW?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'player';
  email_verified: number;
  created_at: number;
  verified_at: number | null;
  last_login_at: number | null;
  last_seen_at: number | null;
  last_platform: string | null;
  last_app_version: string | null;
}

export interface VerificationCodeRecord {
  email: string;
  code_hash: string;
  purpose: 'verify_email' | 'reset_password';
  expires_at: number;
  attempts: number;
  sent_at: number;
}

export interface SessionRecord {
  token_hash: string;
  user_id: string;
  device_id: string | null;
  platform: string | null;
  app_version: string | null;
  created_at: number;
  expires_at: number;
  last_active_at: number;
}

export interface LauncherInstallRecord {
  device_id: string;
  user_id: string | null;
  platform: string;
  arch: string | null;
  app_version: string;
  first_seen_at: number;
  last_seen_at: number;
  launch_count: number;
}

export interface DownloadEventRecord {
  id: string;
  target_type: 'launcher' | 'game';
  target_id: string;
  version: string | null;
  platform: string;
  user_id: string | null;
  device_id: string | null;
  created_at: number;
}

export interface DailyGameScoreRecord {
  game_id: string;
  play_date: string;
  device_id: string;
  score: number;
  updated_at: number;
}

export interface DailyGameScoreStats {
  gameId: string;
  playDate: string;
  score: number;
  totalPlayers: number;
  lowerCount: number;
  equalCount: number;
  empiricalPercentile: number | null;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'player';
  emailVerified: boolean;
  createdAt: string;
  verifiedAt: string | null;
  lastSeenAt: string | null;
}

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DAU_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAU_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory store fallback when D1 is not bound (e.g. unit tests or unprovisioned worker preview)
const memoryStore = {
  users: new Map<string, UserRecord>(), // keyed by lowercase email
  usersById: new Map<string, UserRecord>(),
  codes: new Map<string, VerificationCodeRecord>(),
  sessions: new Map<string, SessionRecord>(),
  installs: new Map<string, LauncherInstallRecord>(),
  downloads: [] as DownloadEventRecord[],
  dailyScores: new Map<string, DailyGameScoreRecord>(), // keyed by `${game_id}:${play_date}:${device_id}`
  loginFailures: new Map<string, { count: number; resetAt: number }>()
};

export function resetMemoryStoreForTests(): void {
  memoryStore.users.clear();
  memoryStore.usersById.clear();
  memoryStore.codes.clear();
  memoryStore.sessions.clear();
  memoryStore.installs.clear();
  memoryStore.downloads.length = 0;
  memoryStore.dailyScores.clear();
  memoryStore.loginFailures.clear();
}

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let d1Initialized = new WeakSet<object>();

async function ensureD1Schema(db: D1DatabaseLike): Promise<void> {
  if (d1Initialized.has(db)) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      verified_at INTEGER,
      last_login_at INTEGER,
      last_seen_at INTEGER,
      last_platform TEXT,
      last_app_version TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS verification_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'verify_email',
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      platform TEXT,
      app_version TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS launcher_installs (
      device_id TEXT PRIMARY KEY,
      user_id TEXT,
      platform TEXT NOT NULL,
      arch TEXT,
      app_version TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      launch_count INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS download_events (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      version TEXT,
      platform TEXT NOT NULL,
      user_id TEXT,
      device_id TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS daily_game_scores (
      game_id TEXT NOT NULL,
      play_date TEXT NOT NULL,
      device_id TEXT NOT NULL,
      score REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, play_date, device_id)
    )`
  ];
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  d1Initialized.add(db);
}

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function isAdminEmail(email: string, env: AuthAnalyticsEnv): boolean {
  const normalized = normalizeEmail(email);
  const rawList = env.ADMIN_EMAILS || 'sazid@inaayah.dev,admin@inaayah.dev';
  const allowed = rawList
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return `pbkdf2_sha256$100000$${toHex(salt)}$${toHex(new Uint8Array(derivedBits))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 1000 || salt.length === 0) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  const actualHex = toHex(new Uint8Array(derivedBits));
  return timingSafeEqualHex(actualHex, expectedHex);
}

export function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const num = 100000 + (array[0] % 900000);
  return String(num);
}

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `inay_${toHex(bytes)}`;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    emailVerified: Boolean(user.email_verified),
    createdAt: new Date(user.created_at).toISOString(),
    verifiedAt: user.verified_at ? new Date(user.verified_at).toISOString() : null,
    lastSeenAt: user.last_seen_at ? new Date(user.last_seen_at).toISOString() : null
  };
}

// --- Database Access Helpers (D1 with Memory Fallback) ---

async function getUserByEmail(email: string, env: AuthAnalyticsEnv): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  if (env.DB) {
    await ensureD1Schema(env.DB);
    return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(normalized).first<UserRecord>();
  }
  return memoryStore.users.get(normalized) || null;
}

async function getUserById(id: string, env: AuthAnalyticsEnv): Promise<UserRecord | null> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRecord>();
  }
  return memoryStore.usersById.get(id) || null;
}

async function saveUser(user: UserRecord, env: AuthAnalyticsEnv): Promise<void> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, role, email_verified, created_at, verified_at, last_login_at, last_seen_at, last_platform, last_app_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         role = excluded.role,
         email_verified = excluded.email_verified,
         verified_at = excluded.verified_at,
         last_login_at = excluded.last_login_at,
         last_seen_at = excluded.last_seen_at,
         last_platform = excluded.last_platform,
         last_app_version = excluded.last_app_version`
    )
      .bind(
        user.id,
        user.email,
        user.display_name,
        user.password_hash,
        user.role,
        user.email_verified,
        user.created_at,
        user.verified_at,
        user.last_login_at,
        user.last_seen_at,
        user.last_platform,
        user.last_app_version
      )
      .run();
    return;
  }
  memoryStore.users.set(user.email, { ...user });
  memoryStore.usersById.set(user.id, { ...user });
}

async function getVerificationCode(email: string, env: AuthAnalyticsEnv): Promise<VerificationCodeRecord | null> {
  const normalized = normalizeEmail(email);
  if (env.DB) {
    await ensureD1Schema(env.DB);
    return env.DB.prepare('SELECT * FROM verification_codes WHERE email = ?').bind(normalized).first<VerificationCodeRecord>();
  }
  return memoryStore.codes.get(normalized) || null;
}

async function saveVerificationCode(record: VerificationCodeRecord, env: AuthAnalyticsEnv): Promise<void> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare(
      `INSERT INTO verification_codes (email, code_hash, purpose, expires_at, attempts, sent_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         code_hash = excluded.code_hash,
         purpose = excluded.purpose,
         expires_at = excluded.expires_at,
         attempts = excluded.attempts,
         sent_at = excluded.sent_at`
    )
      .bind(record.email, record.code_hash, record.purpose, record.expires_at, record.attempts, record.sent_at)
      .run();
    return;
  }
  memoryStore.codes.set(record.email, { ...record });
}

async function deleteVerificationCode(email: string, env: AuthAnalyticsEnv): Promise<void> {
  const normalized = normalizeEmail(email);
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare('DELETE FROM verification_codes WHERE email = ?').bind(normalized).run();
    return;
  }
  memoryStore.codes.delete(normalized);
}

async function saveSession(session: SessionRecord, env: AuthAnalyticsEnv): Promise<void> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, device_id, platform, app_version, created_at, expires_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        session.token_hash,
        session.user_id,
        session.device_id,
        session.platform,
        session.app_version,
        session.created_at,
        session.expires_at,
        session.last_active_at
      )
      .run();
    return;
  }
  memoryStore.sessions.set(session.token_hash, { ...session });
}

async function getSession(tokenHash: string, env: AuthAnalyticsEnv): Promise<SessionRecord | null> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    return env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(tokenHash).first<SessionRecord>();
  }
  return memoryStore.sessions.get(tokenHash) || null;
}

async function deleteSession(tokenHash: string, env: AuthAnalyticsEnv): Promise<void> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return;
  }
  memoryStore.sessions.delete(tokenHash);
}

async function deleteAllUserSessions(userId: string, env: AuthAnalyticsEnv): Promise<void> {
  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
    return;
  }
  for (const [k, v] of memoryStore.sessions.entries()) {
    if (v.user_id === userId) memoryStore.sessions.delete(k);
  }
}

export async function recordInstallHeartbeat(
  params: {
    deviceId: string;
    userId?: string | null;
    platform: string;
    arch?: string | null;
    appVersion: string;
    incrementLaunch?: boolean;
  },
  env: AuthAnalyticsEnv
): Promise<void> {
  const deviceId = (params.deviceId || '').trim().slice(0, 128);
  if (!deviceId) return;
  const now = Date.now();
  const platform = (params.platform || 'unknown').trim().toLowerCase().slice(0, 32);
  const arch = params.arch ? String(params.arch).slice(0, 32) : null;
  const appVersion = (params.appVersion || '0.0.0').trim().replace(/^v/, '').slice(0, 32);

  if (env.DB) {
    await ensureD1Schema(env.DB);
    const inc = params.incrementLaunch ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO launcher_installs (device_id, user_id, platform, arch, app_version, first_seen_at, last_seen_at, launch_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(device_id) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, launcher_installs.user_id),
         platform = excluded.platform,
         arch = COALESCE(excluded.arch, launcher_installs.arch),
         app_version = excluded.app_version,
         last_seen_at = excluded.last_seen_at,
         launch_count = launcher_installs.launch_count + ?`
    )
      .bind(deviceId, params.userId || null, platform, arch, appVersion, now, now, inc)
      .run();
    return;
  }

  const existing = memoryStore.installs.get(deviceId);
  if (existing) {
    existing.user_id = params.userId || existing.user_id;
    existing.platform = platform;
    existing.arch = arch || existing.arch;
    existing.app_version = appVersion;
    existing.last_seen_at = now;
    if (params.incrementLaunch) existing.launch_count += 1;
  } else {
    memoryStore.installs.set(deviceId, {
      device_id: deviceId,
      user_id: params.userId || null,
      platform,
      arch,
      app_version: appVersion,
      first_seen_at: now,
      last_seen_at: now,
      launch_count: 1
    });
  }
}

export async function recordDownloadEvent(
  params: {
    targetType: 'launcher' | 'game';
    targetId: string;
    version?: string | null;
    platform: string;
    userId?: string | null;
    deviceId?: string | null;
  },
  env: AuthAnalyticsEnv
): Promise<void> {
  const event: DownloadEventRecord = {
    id: crypto.randomUUID(),
    target_type: params.targetType,
    target_id: params.targetId.slice(0, 64),
    version: params.version ? params.version.replace(/^v/, '').slice(0, 32) : null,
    platform: (params.platform || 'unknown').toLowerCase().slice(0, 32),
    user_id: params.userId || null,
    device_id: params.deviceId ? params.deviceId.slice(0, 128) : null,
    created_at: Date.now()
  };

  if (env.DB) {
    await ensureD1Schema(env.DB);
    await env.DB.prepare(
      `INSERT INTO download_events (id, target_type, target_id, version, platform, user_id, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        event.id,
        event.target_type,
        event.target_id,
        event.version,
        event.platform,
        event.user_id,
        event.device_id,
        event.created_at
      )
      .run();
    return;
  }

  memoryStore.downloads.push(event);
}

function normalizeUtcDateStr(raw: unknown): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (typeof raw !== 'string') return serverToday;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return serverToday;
  // Prevent future dates (> 1 day ahead of UTC clock) from purging today's live scores
  const maxDate = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return trimmed > maxDate ? serverToday : trimmed;
}

export async function recordDailyGameScore(
  params: {
    gameId: string;
    playDate?: string;
    deviceId: string;
    score: number;
  },
  env: AuthAnalyticsEnv
): Promise<DailyGameScoreStats> {
  const gameId = (params.gameId || 'eyetest').trim().toLowerCase().slice(0, 64);
  const playDate = normalizeUtcDateStr(params.playDate);
  const deviceId = (params.deviceId || '').trim().slice(0, 128);
  const score = Number(Math.max(0, Math.min(100, Number(params.score) || 0)).toFixed(1));
  const now = Date.now();

  if (env.DB) {
    await ensureD1Schema(env.DB);
    // 1. Automatically delete all previous days' stats so D1 only ever retains today's rows
    await env.DB.prepare('DELETE FROM daily_game_scores WHERE play_date < ?')
      .bind(playDate)
      .run();

    // 2. Upsert this device's daily score for (game_id, play_date, device_id)
    if (deviceId) {
      await env.DB.prepare(
        `INSERT INTO daily_game_scores (game_id, play_date, device_id, score, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(game_id, play_date, device_id) DO UPDATE SET
           score = excluded.score,
           updated_at = excluded.updated_at`
      )
        .bind(gameId, playDate, deviceId, score, now)
        .run();
    }
  } else {
    // 1. Purge previous days' rows in memory fallback
    for (const [k, row] of memoryStore.dailyScores.entries()) {
      if (row.play_date < playDate) {
        memoryStore.dailyScores.delete(k);
      }
    }
    // 2. Upsert in memory fallback
    if (deviceId) {
      memoryStore.dailyScores.set(`${gameId}:${playDate}:${deviceId}`, {
        game_id: gameId,
        play_date: playDate,
        device_id: deviceId,
        score,
        updated_at: now
      });
    }
  }

  return queryDailyGameScoreStats({ gameId, playDate, score }, env);
}

export async function queryDailyGameScoreStats(
  params: {
    gameId: string;
    playDate?: string;
    score: number;
  },
  env: AuthAnalyticsEnv
): Promise<DailyGameScoreStats> {
  const gameId = (params.gameId || 'eyetest').trim().toLowerCase().slice(0, 64);
  const playDate = normalizeUtcDateStr(params.playDate);
  const score = Number(Math.max(0, Math.min(100, Number(params.score) || 0)).toFixed(1));

  let totalPlayers = 0;
  let lowerCount = 0;
  let equalCount = 0;

  if (env.DB) {
    await ensureD1Schema(env.DB);
    const row = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total_players,
         SUM(CASE WHEN score < ? THEN 1 ELSE 0 END) AS lower_count,
         SUM(CASE WHEN score = ? THEN 1 ELSE 0 END) AS equal_count
       FROM daily_game_scores
       WHERE game_id = ? AND play_date = ?`
    )
      .bind(score, score, gameId, playDate)
      .first<{ total_players: number; lower_count: number; equal_count: number }>();

    totalPlayers = Number(row?.total_players || 0);
    lowerCount = Number(row?.lower_count || 0);
    equalCount = Number(row?.equal_count || 0);
  } else {
    for (const row of memoryStore.dailyScores.values()) {
      if (row.game_id === gameId && row.play_date === playDate) {
        totalPlayers += 1;
        if (row.score < score) lowerCount += 1;
        else if (row.score === score) equalCount += 1;
      }
    }
  }

  const empiricalPercentile =
    totalPlayers > 0
      ? Number(
          Math.min(
            99.9,
            Math.max(1, ((lowerCount + 0.5 * equalCount) / totalPlayers) * 100)
          ).toFixed(1)
        )
      : null;

  return {
    gameId,
    playDate,
    score,
    totalPlayers,
    lowerCount,
    equalCount,
    empiricalPercentile
  };
}

// --- Outbound OTP Email Sender ---

export interface EmailSendResult {
  delivery: 'email' | 'preview';
  sender: string;
  devOtpCode?: string;
}

export async function sendVerificationEmail(
  toEmail: string,
  displayName: string,
  code: string,
  purpose: 'verify_email' | 'reset_password',
  env: AuthAnalyticsEnv
): Promise<EmailSendResult> {
  const fromAddress = env.EMAIL_FROM || 'Inaayah Studio <noreply@inaayah.dev>';
  const subject =
    purpose === 'reset_password'
      ? `${code} is your Inaayah password reset code`
      : `${code} is your Inaayah Launcher verification code`;

  const actionTitle = purpose === 'reset_password' ? 'Reset Your Password' : 'Verify Your Inaayah Account';
  const actionSubtitle =
    purpose === 'reset_password'
      ? 'Enter the 6-digit security code below inside Inaayah Launcher to choose a new password.'
      : 'Welcome to Inaayah Studio! Enter the 6-digit verification code below inside Inaayah Launcher to activate your account.';

  // Origin-bound last line (@inaayah.dev #123456) enables OS/browser one-time-code autofill
  const textBody = [
    `Hi ${displayName || 'Player'},`,
    '',
    `Your verification code is ${code}.`,
    actionSubtitle,
    'This code expires in 15 minutes.',
    '',
    `@inaayah.dev #${code}`
  ].join('\n');

  const safeName = escapeHtml(displayName || toEmail);
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0b10; color: #f0f4f8; padding: 36px 24px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid rgba(0, 240, 255, 0.2);">
      <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.16em; color: #00f0ff; text-transform: uppercase; margin-bottom: 12px;">
        INAAYAH STUDIO • ACCOUNT SECURITY
      </div>
      <h1 style="font-size: 22px; margin: 0 0 12px 0; color: #ffffff;">${actionTitle}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #9aa5b4; margin: 0 0 24px 0;">
        Hi <strong style="color: #ffffff;">${safeName}</strong>, ${actionSubtitle}
      </p>
      <div style="background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.35); border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #9aa5b4; margin-bottom: 8px;">
          6-Digit Verification Code
        </div>
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: #00f0ff;">
          ${code}
        </div>
      </div>
      <p style="font-size: 12px; color: #6c7788; margin: 0;">
        This code expires in 15 minutes. If you did not request this email, you can safely ignore it.
      </p>
    </div>
  `;

  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
        subject,
        text: textBody,
        html: htmlBody
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to send verification email via Resend (HTTP ${response.status}): ${errText}`);
    }

    return {
      delivery: 'email',
      sender: fromAddress
    };
  }

  // SECURITY: Never expose devOtpCode in production unless ALLOW_DEV_OTP_PREVIEW is explicitly 'true'
  if (env.ALLOW_DEV_OTP_PREVIEW === 'true') {
    return {
      delivery: 'preview',
      sender: fromAddress,
      devOtpCode: code
    };
  }

  throw Object.assign(
    new Error('Email verification service is not configured yet (missing RESEND_API_KEY secret).'),
    { status: 503 }
  );
}

// --- Authentication & Verification Handlers ---

async function issueVerificationCode(
  user: UserRecord,
  purpose: 'verify_email' | 'reset_password',
  env: AuthAnalyticsEnv,
  enforceCooldown = false
): Promise<EmailSendResult> {
  const now = Date.now();
  const existing = await getVerificationCode(user.email, env);
  if (enforceCooldown && existing && now - existing.sent_at < OTP_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - existing.sent_at)) / 1000);
    throw Object.assign(new Error(`Please wait ${waitSec}s before requesting another code.`), { status: 429 });
  }

  const code = generateOtpCode();
  const codeHash = await sha256Hex(`${user.email}:${purpose}:${code}`);
  await saveVerificationCode(
    {
      email: user.email,
      code_hash: codeHash,
      purpose,
      expires_at: now + OTP_TTL_MS,
      attempts: 0,
      sent_at: now
    },
    env
  );

  return sendVerificationEmail(user.email, user.display_name, code, purpose, env);
}

export async function authenticateRequest(
  request: Request,
  env: AuthAnalyticsEnv
): Promise<{ user: UserRecord; tokenHash: string } | null> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const rawToken = match[1].trim();
  if (!rawToken) return null;

  const tokenHash = await sha256Hex(rawToken);
  const session = await getSession(tokenHash, env);
  if (!session) return null;

  const now = Date.now();
  if (session.expires_at <= now) {
    await deleteSession(tokenHash, env);
    return null;
  }

  const user = await getUserById(session.user_id, env);
  if (!user || !user.email_verified) {
    return null;
  }

  // Upgrade role dynamically if email was added to ADMIN_EMAILS
  const shouldBeAdmin = isAdminEmail(user.email, env);
  if (shouldBeAdmin && user.role !== 'admin') {
    user.role = 'admin';
  }

  user.last_seen_at = now;
  await saveUser(user, env);

  return { user, tokenHash };
}

export async function handleAuthAndAnalyticsRequest(
  request: Request,
  pathname: string,
  env: AuthAnalyticsEnv,
  corsHeaders: Record<string, string>,
  getGithubReleaseStats: () => Promise<{
    launcherDownloads: number;
    games: Array<{
      gameId: string;
      title: string;
      version: string;
      gameType?: 'desktop' | 'web';
      githubDownloads: number;
      onlinePlayers?: number;
    }>;
  }>
): Promise<Response | null> {
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  try {
    // 1. POST /api/auth/register
    if (pathname === '/api/auth/register' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 64) : '';
      const platform = typeof body.platform === 'string' ? body.platform.slice(0, 32) : null;
      const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 32) : null;

      if (!isValidEmail(email)) {
        return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({ error: 'Password must be at least 8 characters long.' }, 400);
      }
      if (!displayName || displayName.length < 2) {
        return jsonResponse({ error: 'Please enter your display name (at least 2 characters).' }, 400);
      }

      const existing = await getUserByEmail(email, env);
      if (existing && existing.email_verified) {
        return jsonResponse(
          { error: 'An account with this email already exists. Please sign in instead.', code: 'EMAIL_EXISTS' },
          409
        );
      }

      const now = Date.now();
      const passwordHash = await hashPassword(password);
      const role: 'admin' | 'player' = isAdminEmail(email, env) ? 'admin' : 'player';

      const user: UserRecord = existing
        ? {
            ...existing,
            display_name: displayName,
            password_hash: passwordHash,
            role,
            last_platform: platform || existing.last_platform,
            last_app_version: appVersion || existing.last_app_version
          }
        : {
            id: crypto.randomUUID(),
            email,
            display_name: displayName,
            password_hash: passwordHash,
            role,
            email_verified: 0,
            created_at: now,
            verified_at: null,
            last_login_at: null,
            last_seen_at: now,
            last_platform: platform,
            last_app_version: appVersion
          };

      await saveUser(user, env);
      const mailResult = await issueVerificationCode(user, 'verify_email', env, Boolean(existing));

      return jsonResponse({
        status: 'VERIFICATION_REQUIRED',
        email: user.email,
        sender: mailResult.sender,
        delivery: mailResult.delivery,
        ...(mailResult.devOtpCode ? { devOtpCode: mailResult.devOtpCode } : {}),
        message: `A 6-digit verification code has been sent to ${user.email} from ${mailResult.sender}.`
      });
    }

    // 2. POST /api/auth/verify-email
    if (pathname === '/api/auth/verify-email' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
      const platform = typeof body.platform === 'string' ? body.platform : 'unknown';
      const appVersion = typeof body.appVersion === 'string' ? body.appVersion : '0.0.0';

      if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
        return jsonResponse({ error: 'Please enter a valid 6-digit verification code.' }, 400);
      }

      const user = await getUserByEmail(email, env);
      if (!user) {
        return jsonResponse({ error: 'Account not found. Please sign up first.' }, 404);
      }

      const record = await getVerificationCode(email, env);
      const now = Date.now();
      if (!record || record.purpose !== 'verify_email' || record.expires_at <= now) {
        return jsonResponse(
          { error: 'Verification code has expired. Please request a new 6-digit code.', code: 'OTP_EXPIRED' },
          400
        );
      }

      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await deleteVerificationCode(email, env);
        return jsonResponse(
          { error: 'Too many invalid attempts. Please request a new verification code.', code: 'OTP_LOCKED' },
          429
        );
      }

      const expectedHash = await sha256Hex(`${email}:verify_email:${code}`);
      if (!timingSafeEqualHex(expectedHash, record.code_hash)) {
        record.attempts += 1;
        await saveVerificationCode(record, env);
        return jsonResponse({ error: 'Invalid 6-digit verification code. Please try again.' }, 400);
      }

      await deleteVerificationCode(email, env);

      user.email_verified = 1;
      user.verified_at = user.verified_at || now;
      user.last_login_at = now;
      user.last_seen_at = now;
      user.last_platform = platform || user.last_platform;
      user.last_app_version = appVersion || user.last_app_version;
      if (isAdminEmail(user.email, env)) {
        user.role = 'admin';
      }
      await saveUser(user, env);

      const rawToken = generateSessionToken();
      const tokenHash = await sha256Hex(rawToken);
      await saveSession(
        {
          token_hash: tokenHash,
          user_id: user.id,
          device_id: deviceId || null,
          platform,
          app_version: appVersion,
          created_at: now,
          expires_at: now + SESSION_TTL_MS,
          last_active_at: now
        },
        env
      );

      if (deviceId) {
        await recordInstallHeartbeat(
          { deviceId, userId: user.id, platform, appVersion, incrementLaunch: false },
          env
        );
      }

      return jsonResponse({
        status: 'AUTHENTICATED',
        token: rawToken,
        user: toPublicUser(user)
      });
    }

    // 3. POST /api/auth/resend-code
    if (pathname === '/api/auth/resend-code' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const purpose = body.purpose === 'reset_password' ? 'reset_password' : 'verify_email';

      const user = await getUserByEmail(email, env);
      if (!user) {
        return jsonResponse({ error: 'No account found with this email address.' }, 404);
      }
      if (purpose === 'verify_email' && user.email_verified) {
        return jsonResponse({ error: 'This account is already verified. Please sign in.' }, 400);
      }

      const mailResult = await issueVerificationCode(user, purpose, env, true);
      return jsonResponse({
        ok: true,
        email: user.email,
        sender: mailResult.sender,
        delivery: mailResult.delivery,
        ...(mailResult.devOtpCode ? { devOtpCode: mailResult.devOtpCode } : {}),
        message: `A fresh 6-digit code was sent to ${user.email} from ${mailResult.sender}.`
      });
    }

    // 4. POST /api/auth/login
    if (pathname === '/api/auth/login' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
      const platform = typeof body.platform === 'string' ? body.platform : 'unknown';
      const appVersion = typeof body.appVersion === 'string' ? body.appVersion : '0.0.0';

      if (!isValidEmail(email) || !password) {
        return jsonResponse({ error: 'Please enter your email and password.' }, 400);
      }

      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateKey = `${email}:${clientIp}`;
      const nowAttempt = Date.now();
      const failState = memoryStore.loginFailures.get(rateKey);
      if (failState && failState.resetAt > nowAttempt && failState.count >= LOGIN_MAX_ATTEMPTS) {
        const waitMin = Math.max(1, Math.ceil((failState.resetAt - nowAttempt) / 60000));
        return jsonResponse(
          { error: `Too many failed sign-in attempts. Please try again in ${waitMin} minute(s).` },
          429
        );
      }

      const user = await getUserByEmail(email, env);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        const currentCount = failState && failState.resetAt > nowAttempt ? failState.count + 1 : 1;
        memoryStore.loginFailures.set(rateKey, {
          count: currentCount,
          resetAt: nowAttempt + LOGIN_LOCKOUT_MS
        });
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }

      memoryStore.loginFailures.delete(rateKey);

      // Enforce verified account requirement
      if (!user.email_verified) {
        const mailResult = await issueVerificationCode(user, 'verify_email', env, false);
        return jsonResponse(
          {
            error: 'Your account email is not verified yet. Please enter the 6-digit verification code sent to your email.',
            code: 'EMAIL_NOT_VERIFIED',
            status: 'VERIFICATION_REQUIRED',
            email: user.email,
            sender: mailResult.sender,
            delivery: mailResult.delivery,
            ...(mailResult.devOtpCode ? { devOtpCode: mailResult.devOtpCode } : {})
          },
          403
        );
      }

      const now = Date.now();
      if (isAdminEmail(user.email, env)) {
        user.role = 'admin';
      }
      user.last_login_at = now;
      user.last_seen_at = now;
      user.last_platform = platform || user.last_platform;
      user.last_app_version = appVersion || user.last_app_version;
      await saveUser(user, env);

      const rawToken = generateSessionToken();
      const tokenHash = await sha256Hex(rawToken);
      await saveSession(
        {
          token_hash: tokenHash,
          user_id: user.id,
          device_id: deviceId || null,
          platform,
          app_version: appVersion,
          created_at: now,
          expires_at: now + SESSION_TTL_MS,
          last_active_at: now
        },
        env
      );

      if (deviceId) {
        await recordInstallHeartbeat(
          { deviceId, userId: user.id, platform, appVersion, incrementLaunch: false },
          env
        );
      }

      return jsonResponse({
        status: 'AUTHENTICATED',
        token: rawToken,
        user: toPublicUser(user)
      });
    }

    // 5. POST /api/auth/forgot-password
    if (pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
      }
      const user = await getUserByEmail(email, env);
      if (!user) {
        return jsonResponse({ error: 'No account found with that email address.' }, 404);
      }
      const mailResult = await issueVerificationCode(user, 'reset_password', env, true);
      return jsonResponse({
        status: 'RESET_CODE_SENT',
        email: user.email,
        sender: mailResult.sender,
        delivery: mailResult.delivery,
        ...(mailResult.devOtpCode ? { devOtpCode: mailResult.devOtpCode } : {}),
        message: `A 6-digit password reset code was sent to ${user.email}.`
      });
    }

    // 6. POST /api/auth/reset-password
    if (pathname === '/api/auth/reset-password' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

      if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
        return jsonResponse({ error: 'Please enter a valid 6-digit reset code.' }, 400);
      }
      if (newPassword.length < 8) {
        return jsonResponse({ error: 'New password must be at least 8 characters long.' }, 400);
      }

      const user = await getUserByEmail(email, env);
      if (!user) {
        return jsonResponse({ error: 'Account not found.' }, 404);
      }

      const record = await getVerificationCode(email, env);
      const now = Date.now();
      if (!record || record.purpose !== 'reset_password' || record.expires_at <= now) {
        return jsonResponse({ error: 'Reset code has expired. Please request a new code.' }, 400);
      }
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await deleteVerificationCode(email, env);
        return jsonResponse({ error: 'Too many invalid attempts. Please request a new reset code.' }, 429);
      }

      const expectedHash = await sha256Hex(`${email}:reset_password:${code}`);
      if (!timingSafeEqualHex(expectedHash, record.code_hash)) {
        record.attempts += 1;
        await saveVerificationCode(record, env);
        return jsonResponse({ error: 'Invalid 6-digit reset code.' }, 400);
      }

      await deleteVerificationCode(email, env);
      await deleteAllUserSessions(user.id, env);
      user.password_hash = await hashPassword(newPassword);
      user.email_verified = 1;
      user.verified_at = user.verified_at || now;
      user.last_login_at = now;
      user.last_seen_at = now;
      if (isAdminEmail(user.email, env)) {
        user.role = 'admin';
      }
      await saveUser(user, env);

      const rawToken = generateSessionToken();
      const tokenHash = await sha256Hex(rawToken);
      await saveSession(
        {
          token_hash: tokenHash,
          user_id: user.id,
          device_id: null,
          platform: user.last_platform,
          app_version: user.last_app_version,
          created_at: now,
          expires_at: now + SESSION_TTL_MS,
          last_active_at: now
        },
        env
      );

      return jsonResponse({
        status: 'AUTHENTICATED',
        token: rawToken,
        user: toPublicUser(user)
      });
    }

    // 7. GET /api/auth/me
    if (pathname === '/api/auth/me' && request.method === 'GET') {
      const auth = await authenticateRequest(request, env);
      if (!auth) {
        return jsonResponse({ error: 'Invalid or expired session.' }, 401);
      }
      return jsonResponse({ user: toPublicUser(auth.user) });
    }

    // 8. POST /api/auth/logout
    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      const auth = await authenticateRequest(request, env);
      if (auth) {
        await deleteSession(auth.tokenHash, env);
      }
      return jsonResponse({ ok: true });
    }

    // 9. POST /api/telemetry/heartbeat
    if (pathname === '/api/telemetry/heartbeat' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const auth = await authenticateRequest(request, env).catch(() => null);
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
      const platform = typeof body.platform === 'string' ? body.platform : 'unknown';
      const arch = typeof body.arch === 'string' ? body.arch : null;
      const appVersion = typeof body.appVersion === 'string' ? body.appVersion : '0.0.0';
      const eventType = typeof body.eventType === 'string' ? body.eventType : 'heartbeat';

      const isStandaloneWebGameEvent =
        platform.toLowerCase() === 'web' &&
        (eventType === 'game_launch' || eventType === 'game_download');

      if (deviceId && !isStandaloneWebGameEvent) {
        await recordInstallHeartbeat(
          {
            deviceId,
            userId: auth?.user.id || null,
            platform,
            arch,
            appVersion,
            incrementLaunch: eventType === 'app_launch'
          },
          env
        );
      }

      if (
        (eventType === 'game_download' || eventType === 'game_launch') &&
        typeof body.gameId === 'string'
      ) {
        await recordDownloadEvent(
          {
            targetType: 'game',
            targetId: body.gameId,
            version: typeof body.gameVersion === 'string' ? body.gameVersion : null,
            platform,
            userId: auth?.user.id || null,
            deviceId: deviceId || null
          },
          env
        );
      }

      return jsonResponse({ ok: true, serverTime: new Date().toISOString() });
    }

    // 9b. POST / GET /api/telemetry/daily-score (Ephemeral Daily Score & Percentile)
    if (pathname === '/api/telemetry/daily-score') {
      if (request.method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const gameId = typeof body.gameId === 'string' ? body.gameId : 'eyetest';
        const playDate = typeof body.playDate === 'string' ? body.playDate : undefined;
        const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
        const score = Number(body.score);
        if (!Number.isFinite(score)) {
          return jsonResponse({ error: 'Valid numeric score is required.' }, 400);
        }
        const stats = await recordDailyGameScore(
          { gameId, playDate, deviceId, score },
          env
        );
        return jsonResponse({ ok: true, ...stats });
      }
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const gameId = url.searchParams.get('gameId') || 'eyetest';
        const playDate = url.searchParams.get('playDate') || undefined;
        const score = Number(url.searchParams.get('score') ?? 0);
        const stats = await queryDailyGameScoreStats(
          { gameId, playDate, score: Number.isFinite(score) ? score : 0 },
          env
        );
        return jsonResponse({ ok: true, ...stats });
      }
    }

    // 10. GET /api/analytics/overview (ADMIN ONLY)
    if (pathname === '/api/analytics/overview' && request.method === 'GET') {
      const auth = await authenticateRequest(request, env);
      if (!auth) {
        return jsonResponse({ error: 'Authentication required.' }, 401);
      }
      if (auth.user.role !== 'admin') {
        return jsonResponse(
          { error: 'Forbidden: Detailed studio analytics are restricted to studio administrators.' },
          403
        );
      }

      const now = Date.now();
      const onlineCutoff = now - ONLINE_WINDOW_MS;
      const dauCutoff = now - DAU_WINDOW_MS;
      const mauCutoff = now - MAU_WINDOW_MS;

      const nowDate = new Date(now);
      const todayStartMs = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
      const monthStartMs = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);
      const fourteenDaysStartMs = todayStartMs - 13 * 86_400_000;

      const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const toUtcDayKey = (ts: number): string => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };
      const toUtcMonthKey = (ts: number): string => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      };

      const ghStats = await getGithubReleaseStats().catch(() => ({
        launcherDownloads: 0,
        games: []
      }));

      let allUsers: UserRecord[] = [];
      let allInstalls: LauncherInstallRecord[] = [];
      let allDownloads: DownloadEventRecord[] = [];
      let d1GameAggRows: Array<{
        target_type: string;
        target_id: string;
        platform: string;
        total_count: number;
        today_count: number;
        month_count: number;
        latest_version: string | null;
      }> | null = null;

      if (env.DB) {
        await ensureD1Schema(env.DB);
        const [uRes, iRes, dRes, aggRes] = await Promise.all([
          env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 500').all<UserRecord>(),
          env.DB.prepare('SELECT * FROM launcher_installs ORDER BY last_seen_at DESC LIMIT 2000').all<LauncherInstallRecord>(),
          env.DB.prepare('SELECT * FROM download_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5000')
            .bind(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 5, 1))
            .all<DownloadEventRecord>()
            .catch(() => env.DB!.prepare('SELECT * FROM download_events ORDER BY created_at DESC LIMIT 2000').all<DownloadEventRecord>()),
          env.DB.prepare(
            `SELECT target_type, target_id, platform,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today_count,
                    SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month_count,
                    MAX(version) as latest_version
             FROM download_events
             GROUP BY target_type, target_id, platform`
          )
            .bind(todayStartMs, monthStartMs)
            .all<any>()
            .catch(() => null)
        ]);
        allUsers = uRes.results || [];
        allInstalls = iRes.results || [];
        allDownloads = dRes.results || [];
        if (aggRes && Array.isArray(aggRes.results)) {
          d1GameAggRows = aggRes.results;
        }
      } else {
        allUsers = Array.from(memoryStore.users.values()).sort((a, b) => b.created_at - a.created_at);
        allInstalls = Array.from(memoryStore.installs.values()).sort((a, b) => b.last_seen_at - a.last_seen_at);
        allDownloads = [...memoryStore.downloads].sort((a, b) => b.created_at - a.created_at);
      }

      const verifiedUsers = allUsers.filter((u) => Boolean(u.email_verified));
      const unverifiedUsers = allUsers.filter((u) => !u.email_verified);

      // Active users (union of active verified users and active device heartbeats)
      const onlineUserIds = new Set(
        verifiedUsers.filter((u) => (u.last_seen_at || 0) >= onlineCutoff).map((u) => u.id)
      );
      const onlineDeviceIds = new Set(
        allInstalls.filter((i) => i.last_seen_at >= onlineCutoff).map((i) => i.device_id)
      );
      const onlineNow = Math.max(onlineUserIds.size, onlineDeviceIds.size);

      const dauUsers = verifiedUsers.filter((u) => (u.last_seen_at || 0) >= dauCutoff).length;
      const dauDevices = allInstalls.filter((i) => i.last_seen_at >= dauCutoff).length;
      const dau = Math.max(dauUsers, dauDevices);

      const mauUsers = verifiedUsers.filter((u) => (u.last_seen_at || 0) >= mauCutoff).length;
      const mauDevices = allInstalls.filter((i) => i.last_seen_at >= mauCutoff).length;
      const mau = Math.max(mauUsers, mauDevices);

      const trackedLauncherDownloads = d1GameAggRows
        ? d1GameAggRows
            .filter((r) => r.target_type === 'launcher')
            .reduce((sum, r) => sum + Number(r.total_count || 0), 0)
        : allDownloads.filter((d) => d.target_type === 'launcher').length;
      const uniqueDevices = allInstalls.length;
      const totalLauncherDownloads = Math.max(
        ghStats.launcherDownloads + trackedLauncherDownloads,
        uniqueDevices
      );

      const platformBreakdown: Record<string, number> = {
        darwin: 0,
        win32: 0,
        linux: 0,
        web: 0
      };
      const versionCounts = new Map<string, number>();

      for (const inst of allInstalls) {
        const p = inst.platform.includes('mac') || inst.platform === 'darwin'
          ? 'darwin'
          : inst.platform.includes('win')
          ? 'win32'
          : inst.platform.includes('linux')
          ? 'linux'
          : 'web';
        platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
        const ver = inst.app_version || 'unknown';
        versionCounts.set(ver, (versionCounts.get(ver) || 0) + 1);
      }

      const versionBreakdown = Array.from(versionCounts.entries())
        .map(([version, count]) => ({ version, count }))
        .sort((a, b) => b.count - a.count);

      const gameLauncherPlaysById = new Map<string, number>();
      const gameWebPlaysById = new Map<string, number>();
      const gameTodayWebById = new Map<string, number>();
      const gameTodayLauncherById = new Map<string, number>();
      const gameMonthWebById = new Map<string, number>();
      const gameMonthLauncherById = new Map<string, number>();
      const gameOnlinePlayersById = new Map<string, Set<string>>();
      const gameLatestVersionById = new Map<string, string>();

      if (d1GameAggRows) {
        for (const row of d1GameAggRows) {
          if (row.target_type !== 'game') continue;
          const id = row.target_id;
          const total = Number(row.total_count || 0);
          const today = Number(row.today_count || 0);
          const month = Number(row.month_count || 0);
          if (row.platform === 'web') {
            gameWebPlaysById.set(id, (gameWebPlaysById.get(id) || 0) + total);
            gameTodayWebById.set(id, (gameTodayWebById.get(id) || 0) + today);
            gameMonthWebById.set(id, (gameMonthWebById.get(id) || 0) + month);
          } else {
            gameLauncherPlaysById.set(id, (gameLauncherPlaysById.get(id) || 0) + total);
            gameTodayLauncherById.set(id, (gameTodayLauncherById.get(id) || 0) + today);
            gameMonthLauncherById.set(id, (gameMonthLauncherById.get(id) || 0) + month);
          }
          if (row.latest_version && !gameLatestVersionById.has(id)) {
            gameLatestVersionById.set(id, row.latest_version);
          }
        }
      }

      for (const dl of allDownloads) {
        if (dl.target_type === 'game') {
          if (!d1GameAggRows) {
            if (dl.platform === 'web') {
              gameWebPlaysById.set(dl.target_id, (gameWebPlaysById.get(dl.target_id) || 0) + 1);
              if (dl.created_at >= todayStartMs) {
                gameTodayWebById.set(dl.target_id, (gameTodayWebById.get(dl.target_id) || 0) + 1);
              }
              if (dl.created_at >= monthStartMs) {
                gameMonthWebById.set(dl.target_id, (gameMonthWebById.get(dl.target_id) || 0) + 1);
              }
            } else {
              gameLauncherPlaysById.set(dl.target_id, (gameLauncherPlaysById.get(dl.target_id) || 0) + 1);
              if (dl.created_at >= todayStartMs) {
                gameTodayLauncherById.set(dl.target_id, (gameTodayLauncherById.get(dl.target_id) || 0) + 1);
              }
              if (dl.created_at >= monthStartMs) {
                gameMonthLauncherById.set(dl.target_id, (gameMonthLauncherById.get(dl.target_id) || 0) + 1);
              }
            }
          }
          if (dl.version && !gameLatestVersionById.has(dl.target_id)) {
            gameLatestVersionById.set(dl.target_id, dl.version);
          }
          if (dl.created_at >= onlineCutoff) {
            let activeSet = gameOnlinePlayersById.get(dl.target_id);
            if (!activeSet) {
              activeSet = new Set<string>();
              gameOnlinePlayersById.set(dl.target_id, activeSet);
            }
            activeSet.add(dl.device_id || dl.user_id || dl.id);
          }
        }
      }

      // Build 14-day Daily Breakdown & 6-month Monthly Breakdown
      const dailyMap = new Map<
        string,
        { key: string; label: string; webPlays: number; launcherPlays: number; totalPlays: number; newUsers: number; newInstalls: number }
      >();
      for (let i = 13; i >= 0; i--) {
        const dMs = todayStartMs - i * 86_400_000;
        const d = new Date(dMs);
        const key = toUtcDayKey(dMs);
        const label = `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
        dailyMap.set(key, { key, label, webPlays: 0, launcherPlays: 0, totalPlays: 0, newUsers: 0, newInstalls: 0 });
      }

      const monthlyMap = new Map<
        string,
        { key: string; label: string; webPlays: number; launcherPlays: number; totalPlays: number; newUsers: number; newInstalls: number }
      >();
      for (let i = 5; i >= 0; i--) {
        const mDate = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1));
        const key = toUtcMonthKey(mDate.getTime());
        const label = `${SHORT_MONTHS[mDate.getUTCMonth()]} ${mDate.getUTCFullYear()}`;
        monthlyMap.set(key, { key, label, webPlays: 0, launcherPlays: 0, totalPlays: 0, newUsers: 0, newInstalls: 0 });
      }

      for (const dl of allDownloads) {
        if (dl.target_type !== 'game') continue;
        if (dl.created_at >= fourteenDaysStartMs) {
          const dBucket = dailyMap.get(toUtcDayKey(dl.created_at));
          if (dBucket) {
            if (dl.platform === 'web') dBucket.webPlays += 1;
            else dBucket.launcherPlays += 1;
            dBucket.totalPlays += 1;
          }
        }
        const mBucket = monthlyMap.get(toUtcMonthKey(dl.created_at));
        if (mBucket) {
          if (dl.platform === 'web') mBucket.webPlays += 1;
          else mBucket.launcherPlays += 1;
          mBucket.totalPlays += 1;
        }
      }

      let todayNewUsers = 0;
      let monthNewUsers = 0;
      for (const u of verifiedUsers) {
        const ts = u.verified_at || u.created_at;
        if (ts >= todayStartMs) todayNewUsers += 1;
        if (ts >= monthStartMs) monthNewUsers += 1;
        const dBucket = dailyMap.get(toUtcDayKey(ts));
        if (dBucket) dBucket.newUsers += 1;
        const mBucket = monthlyMap.get(toUtcMonthKey(ts));
        if (mBucket) mBucket.newUsers += 1;
      }

      let todayNewInstalls = 0;
      let monthNewInstalls = 0;
      for (const inst of allInstalls) {
        const ts = inst.first_seen_at || inst.last_seen_at;
        if (ts >= todayStartMs) todayNewInstalls += 1;
        if (ts >= monthStartMs) monthNewInstalls += 1;
        const dBucket = dailyMap.get(toUtcDayKey(ts));
        if (dBucket) dBucket.newInstalls += 1;
        const mBucket = monthlyMap.get(toUtcMonthKey(ts));
        if (mBucket) mBucket.newInstalls += 1;
      }

      const dailyBreakdown = Array.from(dailyMap.values());
      const monthlyBreakdown = Array.from(monthlyMap.values());

      const gameMetrics = ghStats.games.map((g) => {
        const webPlays = gameWebPlaysById.get(g.gameId) || 0;
        const launcherPlays = gameLauncherPlaysById.get(g.gameId) || 0;
        const todayWebPlays = gameTodayWebById.get(g.gameId) || 0;
        const todayLauncherPlays = gameTodayLauncherById.get(g.gameId) || 0;
        const monthWebPlays = gameMonthWebById.get(g.gameId) || 0;
        const monthLauncherPlays = gameMonthLauncherById.get(g.gameId) || 0;
        const cdnOrWebPlays = g.githubDownloads + webPlays;
        const pushedOnline = gameOnlinePlayersById.get(g.gameId)?.size;
        const onlinePlayers =
          typeof g.onlinePlayers === 'number'
            ? g.onlinePlayers
            : g.gameType === 'web' || (pushedOnline && pushedOnline > 0)
            ? pushedOnline || 0
            : undefined;
        const version =
          g.gameType === 'web'
            ? gameLatestVersionById.get(g.gameId) || g.version
            : g.version;
        return {
          gameId: g.gameId,
          title: g.title,
          version,
          gameType: g.gameType || 'desktop',
          githubDownloads: cdnOrWebPlays,
          trackedDownloads: launcherPlays,
          totalDownloads: cdnOrWebPlays + launcherPlays,
          todayDownloads: todayWebPlays + todayLauncherPlays,
          monthDownloads: monthWebPlays + monthLauncherPlays,
          todayWebPlays,
          todayLauncherPlays,
          monthWebPlays,
          monthLauncherPlays,
          ...(typeof onlinePlayers === 'number' ? { onlinePlayers } : {})
        };
      });

      const totalGameDownloads = gameMetrics.reduce((sum, g) => sum + g.totalDownloads, 0);
      const todayPlays = gameMetrics.reduce((sum, g) => sum + (g.todayDownloads || 0), 0);
      const monthPlays = gameMetrics.reduce((sum, g) => sum + (g.monthDownloads || 0), 0);

      const recentUsers = allUsers.slice(0, 50).map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
        emailVerified: Boolean(u.email_verified),
        createdAt: new Date(u.created_at).toISOString(),
        verifiedAt: u.verified_at ? new Date(u.verified_at).toISOString() : null,
        lastSeenAt: u.last_seen_at ? new Date(u.last_seen_at).toISOString() : null,
        platform: u.last_platform,
        appVersion: u.last_app_version,
        isOnline: Boolean(u.last_seen_at && u.last_seen_at >= onlineCutoff)
      }));

      return jsonResponse({
        generatedAt: new Date(now).toISOString(),
        senderEmail: env.EMAIL_FROM || 'Inaayah Studio <noreply@inaayah.dev>',
        summary: {
          totalLauncherDownloads,
          githubReleaseDownloads: ghStats.launcherDownloads,
          trackedLauncherDownloads,
          uniqueDevices,
          registeredUsers: allUsers.length,
          verifiedUsers: verifiedUsers.length,
          unverifiedUsers: unverifiedUsers.length,
          onlineNow,
          dau,
          mau,
          totalGameDownloads,
          todayPlays,
          monthPlays,
          todayNewUsers,
          monthNewUsers,
          todayNewInstalls,
          monthNewInstalls
        },
        platformBreakdown,
        versionBreakdown,
        gameMetrics,
        dailyBreakdown,
        monthlyBreakdown,
        recentUsers
      });
    }
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    return jsonResponse({ error: err?.message || 'Internal server error' }, status);
  }

  return null;
}
