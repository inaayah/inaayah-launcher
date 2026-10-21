import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../mac-update-state.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
const { macUpdatePaths, stagedAppMatchesVersion, macInstallScript, applyMacPatchToStagedBundle } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

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

test('macOS fast patch overlays verified app.asar and Info.plist and rejects mismatched Electron versions', { skip: process.platform !== 'darwin' }, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inaayah-mac-patch-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const installed = path.join(dir, 'Installed.app');
  fixture(installed, '0.2.15');
  mkdirSync(path.join(installed, 'Contents/Resources'), { recursive: true });
  writeFileSync(path.join(installed, 'Contents/Resources/app.asar'), 'old-asar-payload');
  writeFileSync(path.join(installed, 'Contents/Frameworks-marker'), 'preserved-electron-framework');

  const patchDir = path.join(dir, 'patch_payload');
  mkdirSync(path.join(patchDir, 'Contents/Resources'), { recursive: true });
  const newAsar = 'new-asar-payload-v0.2.16';
  const newPlist = `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>0.2.16</string><key>CFBundleIdentifier</key><string>com.inaayah.launcher</string><key>CFBundleExecutable</key><string>launcher</string></dict></plist>`;
  writeFileSync(path.join(patchDir, 'Contents/Resources/app.asar'), newAsar);
  writeFileSync(path.join(patchDir, 'Contents/Info.plist'), newPlist);

  const sha256 = (str) => createHash('sha256').update(str).digest('hex');
  writeFileSync(
    path.join(patchDir, 'patch-meta.json'),
    JSON.stringify({
      version: '0.2.16',
      electronVersion: '34.2.0',
      arch: 'arm64',
      appAsarSha256: sha256(newAsar),
      infoPlistSha256: sha256(newPlist)
    })
  );

  const staged = path.join(dir, 'Staged.app');

  // 1. Mismatched Electron runtime version must return false (triggering full .zip fallback)
  assert.equal(
    await applyMacPatchToStagedBundle({
      installedBundle: installed,
      patchExtractDir: patchDir,
      stagedBundle: staged,
      expectedVersion: '0.2.16',
      expectedElectronVersion: '35.0.0',
      expectedArch: 'arm64',
      resign: false
    }),
    false
  );

  // 2. Matching Electron version and valid SHA-256 hashes succeed and preserve framework files
  assert.equal(
    await applyMacPatchToStagedBundle({
      installedBundle: installed,
      patchExtractDir: patchDir,
      stagedBundle: staged,
      expectedVersion: '0.2.16',
      expectedElectronVersion: '34.2.0',
      expectedArch: 'arm64',
      resign: false
    }),
    true
  );
  assert.equal(readFileSync(path.join(staged, 'Contents/Resources/app.asar'), 'utf8'), newAsar);
  assert.equal(readFileSync(path.join(staged, 'Contents/Frameworks-marker'), 'utf8'), 'preserved-electron-framework');
});
