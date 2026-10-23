-- ============================================================================
-- Inaayah Launcher — Cloudflare D1 Database Schema
-- Accounts, Email OTP Verification, Sessions, Device Installs & Analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
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
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);

CREATE TABLE IF NOT EXISTS verification_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'verify_email',
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  platform TEXT,
  app_version TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS launcher_installs (
  device_id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT NOT NULL,
  arch TEXT,
  app_version TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  launch_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_installs_last_seen ON launcher_installs(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_installs_platform ON launcher_installs(platform);

CREATE TABLE IF NOT EXISTS download_events (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  version TEXT,
  platform TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_downloads_target ON download_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON download_events(created_at);

-- Globally shared revision changes all edge cache namespaces after publication.
CREATE TABLE IF NOT EXISTS release_cache_state (id TEXT PRIMARY KEY, revision TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS release_publications (
  game_id TEXT PRIMARY KEY, version TEXT NOT NULL, fingerprint TEXT NOT NULL, published_at TEXT NOT NULL
);
