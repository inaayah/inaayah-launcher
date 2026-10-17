import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../incremental-update.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const hash = data => createHash('sha256').update(data).digest('hex');
function fixture(size = 3 * 1024 ** 2) {
  let state = 1337;
  const data = Buffer.alloc(size);
  for (let i = 0; i < size; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; data[i] = state >>> 24; }
  return data;
}
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'inaayah-patch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function scenario(t) {
  const root = await workspace(t), installed = path.join(root, 'game'), target = path.join(root, 'target');
  await fs.mkdir(installed); await fs.mkdir(target);
  const before = fixture(), after = Buffer.concat([before.subarray(0, 1000000), Buffer.from('new art inserted here'), before.subarray(1000000)]);
  await fs.writeFile(path.join(installed, 'game.pck'), before);
  await fs.writeFile(path.join(installed, 'obsolete.txt'), 'removed in target');
  await fs.writeFile(path.join(installed, 'manifest.json'), '{"version":"1.0.1"}');
  await fs.writeFile(path.join(target, 'game.pck'), after);
  await fs.writeFile(path.join(target, 'game.x86_64'), 'new executable');
  const r = { format: 1, gameId: 'test-game', version: '1.0.2', platform: 'linux', dataAsset: 'test-game-linux-chunks.bin', dataSize: 0, files: [], chunks: {} };
  const payload = [];
  for (const name of ['game.pck', 'game.x86_64']) {
    const data = await fs.readFile(path.join(target, name));
    const entry = { path: name, mode: name.endsWith('x86_64') ? 0o755 : 0o644, size: data.length, sha256: hash(data), chunks: [] };
    for await (const { data } of api.fileChunks(path.join(target, name))) {
      const id = hash(data); entry.chunks.push(id);
      if (!r.chunks[id]) {
        const compressed = gzipSync(data);
        r.chunks[id] = { offset: r.dataSize, size: data.length, packed: compressed.length };
        r.dataSize += compressed.length; payload.push(compressed);
      }
    }
    r.files.push(entry);
  }
  const bytes = Buffer.concat(payload), calls = [];
  return { root, installed, r, before, after, bytes, calls, options: {
    recipe: api.validateRecipe(r, 'test-game', '1.0.2', 'linux'), gameDir: installed, fullSize: bytes.length,
    metadata: { version: '1.0.2', totalPlaytimeMinutes: 42 },
    range: async (start, end, total) => { calls.push([start, end]); assert.equal(total, bytes.length); return bytes.subarray(start, end + 1); }
  } };
}

test('chunk boundaries and SHA-256 identities match the Python release packager', async t => {
  const root = await workspace(t), file = path.join(root, 'fixture');
  await fs.writeFile(file, fixture());
  const actual = [];
  for await (const { data } of api.fileChunks(file)) actual.push({ size: data.length, sha256: hash(data) });
  const expected = JSON.parse(await fs.readFile(new URL('./fixtures/chunk-fixture.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, expected);
});

test('a shifted PCK reuses installed data, preserves metadata/modes and removes stale files', async t => {
  const s = await scenario(t);
  const result = await api.installIncremental(s.options);
  assert.ok(result.downloadedBytes < s.bytes.length * 0.5);
  assert.ok(result.reusedBytes > s.before.length * 0.5);
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.after);
  await assert.rejects(fs.access(path.join(s.installed, 'obsolete.txt')));
  const meta = JSON.parse(await fs.readFile(path.join(s.installed, 'manifest.json'), 'utf8'));
  assert.equal(meta.totalPlaytimeMinutes, 42);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(s.installed, 'game.x86_64'))).mode & 0o777, 0o755);
  assert.deepEqual((await fs.readdir(s.root)).sort(), ['game', 'target']);
});

test('corrupt patch data never changes the installed game or its version', async t => {
  const s = await scenario(t);
  await assert.rejects(api.installIncremental({ ...s.options, range: async (start, end) => Buffer.alloc(end - start + 1) }));
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.before);
  assert.equal(JSON.parse(await fs.readFile(path.join(s.installed, 'manifest.json'), 'utf8')).version, '1.0.1');
  assert.deepEqual((await fs.readdir(s.root)).sort(), ['game', 'target']);
});

test('cancellation keeps the old installation and cleans temporary content', async t => {
  const s = await scenario(t), controller = new AbortController();
  await assert.rejects(api.installIncremental({ ...s.options, signal: controller.signal, range: async (start, end) => {
    controller.abort(); return s.bytes.subarray(start, end + 1);
  } }));
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.before);
  assert.deepEqual((await fs.readdir(s.root)).sort(), ['game', 'target']);
});

test('when the delta is not cheaper, return to the full-download path without mutating files', async t => {
  const s = await scenario(t);
  assert.equal(await api.installIncremental({ ...s.options, fullSize: 1 }), null);
  assert.deepEqual(s.calls, []);
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.before);
});

test('a failed final rename restores the previous install', async t => {
  const s = await scenario(t);
  await assert.rejects(api.commitInstall(path.join(s.root, 'missing-stage'), s.installed));
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.before);
});

test('paths, symlinks, duplicates, recipe identity and bounded chunk metadata are validated', async t => {
  const { r } = await scenario(t);
  const invalid = change => {
    const copy = structuredClone(r); change(copy);
    assert.throws(() => api.validateRecipe(copy, 'test-game', '1.0.2', 'linux'));
  };
  invalid(r => r.version = '1.0.3');
  invalid(r => r.files[0].path = '../outside');
  invalid(r => r.files[0].path = 'C:\\outside');
  invalid(r => r.files.push({ ...r.files[0], path: 'GAME.PCK' }));
  invalid(r => r.files.push({ path: 'game.pck/child', mode: 0o644, link: '../game.x86_64' }));
  invalid(r => r.files.push({ path: 'escape', mode: 0o777, link: '../../outside' }));
  invalid(r => Object.values(r.chunks)[0].size = 2 ** 30);
  invalid(r => r.files[0].sha256 = 'bad');
});


test('startup restores an installation interrupted between folder renames', async t => {
  const s = await scenario(t);
  await fs.writeFile(path.join(s.installed, 'manifest.json'), JSON.stringify({ id: 'game', version: '1.0.1' }));
  await fs.rename(s.installed, path.join(s.root, '.inaayah-previous-game'));
  await api.recoverInterruptedInstalls(s.root);
  assert.deepEqual(await fs.readFile(path.join(s.installed, 'game.pck')), s.before);
  assert.deepEqual((await fs.readdir(s.root)).sort(), ['game', 'target']);
});
