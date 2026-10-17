import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';

test('actual download handler installs valid ZIPs, rejects corrupt downloads and retains the existing game', async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'inaayah-full-install-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const userData = path.join(root, 'user-data'), library = path.join(root, 'library');
  await fs.mkdir(userData); await fs.mkdir(library);
  const executable = process.platform === 'darwin' ? 'Game.app/Contents/MacOS/Game' : process.platform === 'win32' ? 'Game.exe' : 'Game.x86_64';
  const archive = new AdmZip();
  archive.addFile(executable, Buffer.from('runtime executable'));
  archive.addFile('README.txt', Buffer.from('runtime notices'));
  const data = archive.toBuffer();
  const release = { id: 'fixture-game', version: '1.0.1', downloads: { [process.platform]: {
    name: 'fixture.zip', sizeBytes: data.length, sha256: createHash('sha256').update(data).digest('hex')
  } } };
  let corrupt = false;
  const server = http.createServer((request, response) => {
    if (request.url.endsWith('/manifest')) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(release)); }
    else {
      response.setHeader('Content-Length', data.length);
      const payload = Buffer.from(data);
      if (corrupt) payload[0] ^= 1;
      response.end(payload);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const gateway = `http://127.0.0.1:${server.address().port}`;
  await fs.writeFile(path.join(userData, 'launcher_config.json'), JSON.stringify({ libraryPath: library, releaseGatewayUrl: gateway }));
  const key = `__inaayah_test_handlers_${Date.now()}`;
  globalThis[key] = new Map();
  t.after(() => delete globalThis[key]);
  const electron = `export const app={getPath:()=>${JSON.stringify(userData)},getAppPath:()=>${JSON.stringify(root)},isPackaged:true,whenReady:()=>new Promise(()=>{}),on:()=>{}};
    export const ipcMain={handle:(name,fn)=>globalThis[${JSON.stringify(key)}].set(name,fn),on:()=>{}};
    export const BrowserWindow=class{};export const dialog={};export const shell={};export const session={};export const Notification={};`;
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../main.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022', plugins: [{
    name: 'mock-electron-shell', setup(b) {
      b.onResolve({ filter: /^(electron|electron-updater)$/ }, a => ({ path: a.path, namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, a => ({ contents: a.path === 'electron' ? electron : 'export const autoUpdater={};', loader: 'js' }));
    }
  }] });
  const bundled = path.join(root, 'main.cjs');
  await fs.writeFile(bundled, outputFiles[0].text);
  createRequire(import.meta.url)(bundled);
  const download = globalThis[key].get('launcher:download-game');
  const game = path.join(library, 'fixture-game');
  assert.equal(await download({}, 'fixture-game', '1.0.1'), true);
  assert.equal((await fs.readFile(path.join(game, executable))).toString(), 'runtime executable');
  assert.equal(JSON.parse(await fs.readFile(path.join(game, 'manifest.json'))).version, '1.0.1');
  release.version = '1.0.2'; corrupt = true;
  assert.equal(await download({}, 'fixture-game', '1.0.2'), false);
  assert.equal(JSON.parse(await fs.readFile(path.join(game, 'manifest.json'))).version, '1.0.1');
  assert.equal((await fs.readFile(path.join(game, executable))).toString(), 'runtime executable');
  assert.deepEqual(await fs.readdir(library), ['fixture-game']);
});
