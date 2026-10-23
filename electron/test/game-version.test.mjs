import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const compile = async file => {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
};
const { newerGameVersion, retainNewerCatalog } = await compile('../game-version.ts');
const { commitInstall } = await compile('../incremental-update.ts');

test('older or equal feeds never become updates, including numeric and v-prefix cases', () => {
  for (const [candidate, installed] of [['1.1.0', '1.2.0'], ['1.2.0', '1.2.0'], ['v1.2.0', '1.2.0'], ['1.9.0', '1.10.0']]) {
    assert.equal(newerGameVersion(candidate, installed), false);
  }
  assert.equal(newerGameVersion('1.10.0', '1.9.0'), true);
  assert.equal(newerGameVersion('nonsense', '1.2.0'), false);
  const latest = { id: 'game', gameType: 'desktop', version: '1.2.0', downloads: { linux: { sha256: 'new' } } };
  assert.deepEqual(retainNewerCatalog([{ ...latest, version: '1.0.0', downloads: {} }], [latest]), [latest]);
});

test('an update staged before another newer installation cannot downgrade at the rename boundary', async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'inaayah-downgrade-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'game'), stage = path.join(root, 'staged');
  for (const folder of [game, stage]) await fs.mkdir(folder);
  await fs.writeFile(path.join(game, 'manifest.json'), JSON.stringify({ id: 'game', version: '1.3.0' }));
  await fs.writeFile(path.join(game, 'runtime'), 'newer game');
  await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify({ id: 'game', version: '1.2.0' }));
  await assert.rejects(commitInstall(stage, game), /Refusing.*older/);
  assert.equal(await fs.readFile(path.join(game, 'runtime'), 'utf8'), 'newer game');
  assert.equal(JSON.parse(await fs.readFile(path.join(game, 'manifest.json'))).version, '1.3.0');
  assert.deepEqual((await fs.readdir(root)).sort(), ['game', 'staged']);
});
