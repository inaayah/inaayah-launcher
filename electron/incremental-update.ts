import { assertNotOlderInstall } from './game-version';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

type Chunk = { offset: number; packed: number; size: number };
type Entry = { path: string; mode: number; size?: number; sha256?: string; chunks?: string[]; link?: string };
export type Recipe = { format: number; gameId: string; version: string; platform: string; dataAsset: string; dataSize: number; files: Entry[]; chunks: Record<string, Chunk> };
type Local = { file: string; offset: number; size: number };
const MIN = 65536, MAX = 1048576, MASK = (1 << 18) - 1;
const gear = Array.from({ length: 256 }, (_, i) => createHash('sha256').update(`inaayah-chunk-${i}`).digest().readUInt32LE());
const activeInstalls = new Set<string>();
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const integer = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
const safePath = (name: unknown): name is string => typeof name === 'string' && name.length > 0 && name.length < 1024 && !/[\\:\x00-\x1f]/.test(name) && name.split('/').every(p => p && p !== '.' && p !== '..') && !name.startsWith('/');

export function validateRecipe(value: unknown, gameId: string, version: string, platform: string): Recipe {
  const r = value as Recipe;
  if (!r || r.format !== 1 || r.gameId !== gameId || r.version !== version || r.platform !== platform || !integer(r.dataSize, 16 * 1024 ** 3) || !Array.isArray(r.files) || r.files.length > 50000 || !r.chunks || typeof r.chunks !== 'object' || Array.isArray(r.chunks) || !safePath(r.dataAsset) || r.dataAsset.includes('/')) throw new Error('Invalid incremental release metadata');
  const names = new Set<string>();
  let totalSize = 0;
  for (const [id, chunk] of Object.entries(r.chunks)) {
    if (!/^[a-f0-9]{64}$/.test(id) || !chunk || !integer(chunk.offset) || !integer(chunk.packed, MAX + 4096) || !chunk.packed || !integer(chunk.size, MAX) || !chunk.size || chunk.offset + chunk.packed > r.dataSize) throw new Error('Invalid release chunk');
  }
  for (const entry of r.files) {
    if (!entry || !safePath(entry.path) || names.has(entry.path.toLowerCase()) || entry.path.toLowerCase() === 'manifest.json' || !integer(entry.mode, 0o777)) throw new Error('Invalid release path');
    names.add(entry.path.toLowerCase());
    if (entry.link !== undefined) {
      if (typeof entry.link !== 'string' || !entry.link || /[\\:\x00-\x1f]/.test(entry.link) || entry.link.startsWith('/')) throw new Error('Invalid release symlink');
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), entry.link));
      if (target === '..' || target.startsWith('../')) throw new Error('Release symlink escapes game');
    } else {
      if (!integer(entry.size, 16 * 1024 ** 3) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Array.isArray(entry.chunks) || entry.chunks.length > 65536 || entry.chunks.some(id => !Object.hasOwn(r.chunks, id)) || entry.chunks.reduce((n, id) => n + r.chunks[id].size, 0) !== entry.size) throw new Error('Invalid release file');
      totalSize += entry.size!;
    }
  }
  if (!r.files.length || totalSize > 32 * 1024 ** 3) throw new Error('Invalid release size');
  for (const entry of r.files) {
    const parts = entry.path.toLowerCase().split('/');
    while (parts.pop() && parts.length) if (names.has(parts.join('/'))) throw new Error('Release file is also a parent directory');
  }
  return r;
}

export async function* fileChunks(file: string, signal?: AbortSignal): AsyncGenerator<{ data: Buffer; offset: number }> {
  const handle = await fs.open(file, 'r');
  let buffer = Buffer.allocUnsafe(MAX), size = 0, rolling = 0, offset = 0;
  const read = Buffer.allocUnsafe(65536);
  try {
    while (true) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(read, 0, read.length, null);
      if (!bytesRead) break;
      for (let i = 0; i < bytesRead; i++) {
        const byte = read[i];
        buffer[size++] = byte;
        rolling = ((rolling << 1) + gear[byte]) >>> 0;
        if (size >= MIN && ((rolling & MASK) === 0 || size >= MAX)) {
          yield { data: buffer.subarray(0, size), offset };
          offset += size;
          buffer = Buffer.allocUnsafe(MAX); size = 0; rolling = 0;
        }
      }
    }
    if (size) yield { data: buffer.subarray(0, size), offset };
  } finally { await handle.close(); }
}

async function ordinaryLocalFile(root: string, name: string): Promise<string | null> {
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) return null; } catch { return null; }
  }
  return (await fs.stat(current)).isFile() ? current : null;
}

export async function recoverInterruptedInstalls(library: string): Promise<void> {
  for (const entry of await fs.readdir(library, { withFileTypes: true }).catch(() => [])) {
    const match = entry.name.match(/^\.inaayah-previous-([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (!match || !entry.isDirectory() || entry.isSymbolicLink() || activeInstalls.has(path.join(library, match[1]))) continue;
    const backup = path.join(library, entry.name), destination = path.join(library, match[1]);
    try {
      const old = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
      if (old.id !== match[1]) continue;
      const exists = await fs.lstat(destination).catch(() => null);
      if (!exists) await fs.rename(backup, destination);
      else if (exists.isDirectory() && !exists.isSymbolicLink()) {
        const current = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
        if (current.id === match[1] && typeof current.version === 'string') await fs.rm(backup, { recursive: true });
      }
    } catch { /* Leave an unrecognized backup available for recovery. */ }
  }
}

// Only verified, fully assembled content is moved into the live installation.
// The sibling backup also makes a failed final rename recoverable on Windows.
export async function commitInstall(stage: string, destination: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const backup = path.join(path.dirname(destination), `.inaayah-previous-${path.basename(destination)}`);
  await recoverInterruptedInstalls(path.dirname(destination));
  // Check again at the rename boundary: another installation may have completed
  // while this full or incremental package was downloading.
  const staged = JSON.parse(await fs.readFile(path.join(stage, 'manifest.json'), 'utf8'));
  await assertNotOlderInstall(destination, staged.version);
  activeInstalls.add(destination);
  let moved = false, committed = false;
  try {
    try { await fs.rename(destination, backup); moved = true; } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    try { await fs.rename(stage, destination); committed = true; } catch (error) {
      if (moved) await fs.rename(backup, destination);
      throw error;
    }
  } finally {
    // Once the new content is in place, a cleanup failure must not trigger a retry.
    if (committed && moved) await fs.rm(backup, { recursive: true, force: true }).catch(() => {});
    activeInstalls.delete(destination);
  }
}

export async function installIncremental(options: {
  recipe: Recipe; gameDir: string; fullSize: number; signal?: AbortSignal;
  metadata: Record<string, unknown>;
  range: (start: number, end: number, total: number) => Promise<Buffer>;
  progress?: (phase: 'VERIFYING' | 'DOWNLOADING' | 'EXTRACTING', received: number, total: number) => void;
}): Promise<{ downloadedBytes: number; reusedBytes: number } | null> {
  const { recipe: r, gameDir, signal, progress } = options;
  const local = new Map<string, Local>();
  progress?.('VERIFYING', 0, 0);
  for (const entry of r.files) {
    signal?.throwIfAborted();
    if (entry.link !== undefined) continue;
    const file = await ordinaryLocalFile(gameDir, entry.path);
    if (!file) continue;
    for await (const chunk of fileChunks(file, signal)) {
      const id = hash(chunk.data);
      if (Object.hasOwn(r.chunks, id)) local.set(id, { file, offset: chunk.offset, size: chunk.data.length });
    }
  }
  const missing = Object.entries(r.chunks).filter(([id]) => !local.has(id)).sort((a, b) => a[1].offset - b[1].offset);
  const groups: { start: number; end: number; ids: string[] }[] = [];
  for (const [id, c] of missing) {
    const last = groups.at(-1), end = c.offset + c.packed - 1;
    if (last && c.offset - last.end <= 65536 && end - last.start < 8 * 1024 ** 2) { last.end = end; last.ids.push(id); }
    else groups.push({ start: c.offset, end, ids: [id] });
  }
  const transfer = groups.reduce((n, g) => n + g.end - g.start + 1, 0);
  // A new installation or extensively changed build is cheaper as the normal ZIP.
  if (!local.size || transfer >= options.fullSize * 0.8) return null;
  const temporary = await fs.mkdtemp(path.join(path.dirname(gameDir), '.inaayah-install-'));
  const stage = path.join(temporary, 'content'), cache = path.join(temporary, 'chunks');
  await fs.mkdir(stage); await fs.mkdir(cache);
  let received = 0, reused = 0;
  try {
    for (const group of groups) {
      signal?.throwIfAborted();
      const packed = await options.range(group.start, group.end, r.dataSize);
      if (packed.length !== group.end - group.start + 1) throw new Error('Incomplete patch range');
      for (const id of group.ids) {
        const c = r.chunks[id];
        const data = gunzipSync(packed.subarray(c.offset - group.start, c.offset - group.start + c.packed), { maxOutputLength: c.size });
        if (data.length !== c.size || hash(data) !== id) throw new Error('Patch chunk verification failed');
        await fs.writeFile(path.join(cache, id), data);
      }
      received += packed.length;
      progress?.('DOWNLOADING', received, transfer);
    }
    progress?.('EXTRACTING', received, transfer);
    for (const entry of r.files) {
      signal?.throwIfAborted();
      const output = path.join(stage, entry.path);
      await fs.mkdir(path.dirname(output), { recursive: true });
      if (entry.link !== undefined) { await fs.symlink(entry.link, output); continue; }
      const handle = await fs.open(output, 'wx');
      const whole = createHash('sha256');
      try {
        for (const id of entry.chunks!) {
          signal?.throwIfAborted();
          const c = local.get(id);
          let data: Buffer;
          if (c) {
            const source = await fs.open(c.file, 'r');
            try {
              data = Buffer.alloc(c.size);
              const { bytesRead } = await source.read(data, 0, data.length, c.offset);
              if (bytesRead !== data.length || hash(data) !== id) throw new Error('Installed chunk changed during update');
            } finally { await source.close(); }
            reused += data.length;
          } else data = await fs.readFile(path.join(cache, id));
          whole.update(data);
          await handle.writeFile(data);
        }
      } finally { await handle.close(); }
      if (whole.digest('hex') !== entry.sha256) throw new Error('Rebuilt game verification failed');
      if (process.platform !== 'win32') await fs.chmod(output, entry.mode);
    }
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(options.metadata, null, 2));
    await commitInstall(stage, gameDir, signal);
    return { downloadedBytes: received, reusedBytes: reused };
  } finally { await fs.rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}
