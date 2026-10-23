import fs from 'node:fs/promises';
import path from 'node:path';

function stableParts(version: unknown): number[] | null {
  return typeof version === 'string' && /^v?\d+\.\d+\.\d+$/.test(version)
    ? version.replace(/^v/, '').split('.').map(Number) : null;
}

export function newerGameVersion(candidate: unknown, current: unknown): boolean {
  const next = stableParts(candidate), previous = stableParts(current);
  if (!next || !previous) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== previous[i]) return next[i] > previous[i];
  }
  return false;
}

export class GameDowngradeError extends Error {}

export async function assertNotOlderInstall(destination: string, targetVersion: string): Promise<void> {
  let installed: any;
  try { installed = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8')); }
  catch { return; }
  if (newerGameVersion(installed.version, targetVersion)) {
    throw new GameDowngradeError(`Refusing to replace installed ${installed.version} with older ${targetVersion}. Refresh the release feed.`);
  }
}

export function retainNewerCatalog(incoming: any[], cached: any[]): any[] {
  const known = new Map(cached.map(item => [item.id, item]));
  return incoming.map(item => {
    const previous = known.get(item.id);
    return item.gameType === 'desktop' && previous && newerGameVersion(previous.version, item.version)
      ? { ...item, ...previous } : item;
  });
}
