import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const compile = async (file) => {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'es2022'
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
};

const {
  resolveLibraryPath,
  validateWebGameUrl,
  webGameStatsPath,
  loadWebGameStats,
  recordWebGameSession,
  terminateSpawnedGameProcess
} = await compile('../web-game-launch.ts');

test('resolveLibraryPath expands ~ prefixes and falls back cleanly without changing absolute paths', () => {
  const home = '/Users/tester';
  assert.equal(resolveLibraryPath('~', home), home);
  assert.equal(resolveLibraryPath('~/InaayahGames', home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath('~\\InaayahGames', home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath('', home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath('   ', home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath(undefined, home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath(null, home), path.join(home, 'InaayahGames'));
  assert.equal(resolveLibraryPath('/Volumes/FastSSD/InaayahGames', home), '/Volumes/FastSSD/InaayahGames');
});

test('validateWebGameUrl accepts http/https URLs and rejects unsafe or invalid schemes', () => {
  assert.equal(validateWebGameUrl('https://kettle-court.inaayah.dev/'), 'https://kettle-court.inaayah.dev/');
  assert.equal(validateWebGameUrl('http://localhost:5173/'), 'http://localhost:5173/');

  for (const bad of ['file:///tmp/x', 'javascript:alert(1)', 'not a url', '']) {
    assert.throws(() => validateWebGameUrl(bad), /Invalid web game URL/);
  }
});

test('recordWebGameSession and loadWebGameStats persist playtime in userData without touching libraryPath', async (t) => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), 'inaayah-web-launch-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const userDataDir = path.join(root, 'userData');
  const libraryPath = path.join(root, 'nonexistent-library');

  assert.deepEqual(loadWebGameStats(userDataDir), {});

  const first = recordWebGameSession(userDataDir, 'kettle-court', 'https://kettle-court.inaayah.dev/', 3, 1700000000000);
  assert.equal(first.id, 'kettle-court');
  assert.equal(first.url, 'https://kettle-court.inaayah.dev/');
  assert.equal(first.firstPlayedAt, 1700000000000);
  assert.equal(first.lastPlayedAt, 1700000000000);
  assert.equal(first.totalPlaytimeMinutes, 3);

  const second = recordWebGameSession(userDataDir, 'kettle-court', 'https://kettle-court.inaayah.dev/', 0.2, 1700000600000);
  assert.equal(second.firstPlayedAt, 1700000000000);
  assert.equal(second.lastPlayedAt, 1700000600000);
  assert.equal(second.totalPlaytimeMinutes, 4);

  const loaded = loadWebGameStats(userDataDir);
  assert.deepEqual(loaded['kettle-court'], second);
  assert.equal(fs.existsSync(webGameStatsPath(userDataDir)), true);
  assert.equal(fs.existsSync(libraryPath), false);
});

const waitForReadyStdout = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const onError = (err) => reject(err);
    child.once('error', onError);
    child.stdout.once('data', () => {
      child.removeListener('error', onError);
      child.stdout.destroy();
      resolve(child);
    });
  });

test('terminateSpawnedGameProcess closes running children gracefully and force-kills stubborn ones', async (t) => {
  assert.equal(await terminateSpawnedGameProcess(null), false);
  assert.equal(await terminateSpawnedGameProcess(undefined), false);

  const shortLived = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((resolve) => shortLived.once('exit', resolve));
  assert.equal(await terminateSpawnedGameProcess(shortLived), true);

  const gracefulChild = await waitForReadyStdout(
    "process.on('SIGTERM', () => process.exit(0)); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"
  );
  t.after(() => { try { process.kill(-gracefulChild.pid, 'SIGKILL'); } catch {} });
  assert.equal(await terminateSpawnedGameProcess(gracefulChild, { graceMs: 1000, forceMs: 500 }), true);
  assert.notEqual(gracefulChild.exitCode, null);

  const stubbornChild = await waitForReadyStdout(
    "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"
  );
  t.after(() => { try { process.kill(-stubbornChild.pid, 'SIGKILL'); } catch {} });
  assert.equal(await terminateSpawnedGameProcess(stubbornChild, { graceMs: 80, forceMs: 1000 }), true);
  assert.equal(stubbornChild.signalCode, 'SIGKILL');
});
