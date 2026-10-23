import type { GameCatalogItem, GameStatus, InstalledGame } from '../types/launcher';
import { compareVersions } from './version';

export function settledGameStatus(game: GameCatalogItem | undefined, installed?: InstalledGame): GameStatus {
  if (installed?.version?.includes('Local Dev') || installed?.installPath?.includes('godot')) return 'INSTALLED';
  if (game?.isComingSoon) return 'NOT_INSTALLED';
  if (game?.gameType === 'web') return 'INSTALLED';
  if (!installed) return 'NOT_INSTALLED';
  return game && compareVersions(game.version, installed.version) > 0 ? 'UPDATE_AVAILABLE' : 'INSTALLED';
}

export function computeGameStatuses(catalog: GameCatalogItem[], installed: Record<string, InstalledGame>,
  existing: Record<string, GameStatus>): Record<string, GameStatus> {
  const next = { ...existing };
  for (const game of catalog) {
    if (['DOWNLOADING', 'EXTRACTING', 'RUNNING'].includes(existing[game.id])) continue;
    next[game.id] = settledGameStatus(game, installed[game.id]);
  }
  return next;
}
