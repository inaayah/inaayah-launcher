import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { outputFiles } = await build({ entryPoints: [new URL('../mac-update-state.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
const { macUpdatePaths, stagedAppMatchesVersion, macInstallScript } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('updates use separate version folders and reject path traversal', () => {
  assert.notEqual(macUpdatePaths('/tmp/updates', '0.2.9').extractedDir, macUpdatePaths('/tmp/updates', '0.2.10').extractedDir);
  assert.throws(() => macUpdatePaths('/tmp/updates', '../old'));
});

function fixture(bundle, version) {
  mkdirSync(path.join(bundle, 'Contents/MacOS'), { recursive: true });
  writeFileSync(path.join(bundle, 'Contents/MacOS/launcher'), 'test executable');
  writeFileSync(path.join(bundle, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleIdentifier</key><string>com.inaayah.launcher</string><key>CFBundleExecutable</key><string>launcher</string></dict></plist>`);
}

test('a cached 0.2.7 app is never marked ready as a newer release', { skip: process.platform !== 'darwin' }, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inaayah-updater-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'Cached.app');
  fixture(app, '0.2.7');
  assert.equal(await stagedAppMatchesVersion(app, '0.2.10'), false);
  fixture(app, '0.2.10');
  assert.equal(await stagedAppMatchesVersion(app, '0.2.10'), true);
  rmSync(path.join(app, 'Contents/MacOS/launcher'));
  assert.equal(await stagedAppMatchesVersion(app, '0.2.10'), false);
});

test('installation rejects a stale app before changing the installed copy, then replaces a valid update', { skip: process.platform !== 'darwin' }, t => {
  const dir = mkdtempSync(path.join(tmpdir(), "inaayah updater's test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'New.app'), target = path.join(dir, 'Installed.app');
  fixture(target, '0.2.7');
  writeFileSync(path.join(target, 'old-marker'), 'old');
  fixture(source, '0.2.7');
  const script = path.join(dir, 'install.sh');
  const options = { pid: 2147483647, source, target, version: '0.2.10', logPath: path.join(dir, 'install.log'), launch: false };
  writeFileSync(script, macInstallScript(options));
  assert.notEqual(spawnSync('/bin/bash', [script]).status, 0);
  assert.ok(existsSync(path.join(target, 'old-marker')));
  fixture(source, '0.2.10');
  writeFileSync(path.join(source, 'new-marker'), 'new');
  writeFileSync(script, macInstallScript(options));
  assert.equal(spawnSync('/bin/bash', [script]).status, 0, readFileSync(options.logPath, 'utf8'));
  assert.ok(existsSync(path.join(target, 'new-marker')));
  assert.equal(existsSync(path.join(target, 'old-marker')), false);
});
