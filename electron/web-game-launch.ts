import fs from 'node:fs';
import path from 'node:path';

export interface WebGamePlayStat {
  id: string;
  url: string;
  firstPlayedAt: number;
  lastPlayedAt: number | null;
  totalPlaytimeMinutes: number;
}

/** Expand leading ~ / ~/ / ~\ in a configured library path to the user's home directory. */
export function resolveLibraryPath(rawPath: string | undefined | null, homeDir: string): string {
  const trimmed = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!trimmed) {
    return path.join(homeDir, 'InaayahGames');
  }
  if (trimmed === '~') {
    return homeDir;
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(homeDir, trimmed.slice(2));
  }
  return trimmed;
}

/** Validate that a web game URL uses http: or https: and return its normalized string form. */
export function validateWebGameUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid web game URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid web game URL');
  }
  return parsed.toString();
}

/** Return the path where web game playtime stats are stored under Electron userData. */
export function webGameStatsPath(userDataDir: string): string {
  return path.join(userDataDir, 'web_game_stats.json');
}

/** Load recorded web game playtime stats from userData without throwing on missing or corrupt files. */
export function loadWebGameStats(userDataDir: string): Record<string, WebGamePlayStat> {
  const filePath = webGameStatsPath(userDataDir);
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const result: Record<string, WebGamePlayStat> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as Partial<WebGamePlayStat>;
      if (typeof entry.url !== 'string') continue;
      let normalizedUrl: string;
      try {
        normalizedUrl = validateWebGameUrl(entry.url);
      } catch {
        continue;
      }
      const id = typeof entry.id === 'string' && entry.id ? entry.id : key;
      const firstPlayedAt = typeof entry.firstPlayedAt === 'number' && Number.isFinite(entry.firstPlayedAt)
        ? entry.firstPlayedAt
        : Date.now();
      const lastPlayedAt = typeof entry.lastPlayedAt === 'number' && Number.isFinite(entry.lastPlayedAt)
        ? entry.lastPlayedAt
        : null;
      const totalPlaytimeMinutes = typeof entry.totalPlaytimeMinutes === 'number' && Number.isFinite(entry.totalPlaytimeMinutes) && entry.totalPlaytimeMinutes >= 0
        ? entry.totalPlaytimeMinutes
        : 0;
      result[key] = { id, url: normalizedUrl, firstPlayedAt, lastPlayedAt, totalPlaytimeMinutes };
    }
    return result;
  } catch {
    return {};
  }
}

/** Accumulate a finished web game session in userData without touching the desktop game libraryPath. */
export function recordWebGameSession(
  userDataDir: string,
  gameId: string,
  url: string,
  elapsedMinutes: number,
  now = Date.now()
): WebGamePlayStat {
  const stats = loadWebGameStats(userDataDir);
  const existing = stats[gameId];
  const updated: WebGamePlayStat = {
    id: gameId,
    url,
    firstPlayedAt: existing?.firstPlayedAt || now,
    lastPlayedAt: now,
    totalPlaytimeMinutes: (existing?.totalPlaytimeMinutes || 0) + Math.max(1, Math.round(elapsedMinutes))
  };
  stats[gameId] = updated;
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(webGameStatsPath(userDataDir), JSON.stringify(stats, null, 2), 'utf-8');
  return updated;
}
