import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { create, act } from 'react-test-renderer';

const root = await fs.mkdtemp(path.join(tmpdir(), 'inaayah-renderer-'));
const stateKey = '__inaayahLandingTest';
const components = ['TitleBar', 'Sidebar', 'GameHero', 'LibraryGrid', 'StoreCatalog', 'DownloadsQueue', 'SettingsModal', 'AuthGate', 'StudioAnalytics'];
const bundled = await build({ entryPoints: [fileURLToPath(new URL('../App.tsx', import.meta.url))], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], plugins: [{ name: 'bridge-fixture', setup(b) {
    b.onResolve({ filter: /services\/(electronBridge|authService)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'js', contents: a.path.endsWith('electronBridge')
      ? `export const launcherBridge = globalThis.${stateKey}.bridge;`
      : `export const getStoredUser=()=>({id:'test'}); export const authService={verifySession:async()=>({id:'test'}),sendHeartbeat:async()=>{}};` }));
    b.onResolve({ filter: /components\// }, a => ({ path: a.path.split('/').pop(), namespace: 'component' }));
    b.onLoad({ filter: /.*/, namespace: 'component' }, a => ({ loader: 'js', contents: `import React from 'react';export const ${a.path}=props=>React.createElement('${a.path}',props);` }));
  } }] });
// Keep the external React import bound to the same copy used by the renderer.
const require = createRequire(import.meta.url);
const load = (source) => { const module = { exports: {} }; new Function('require', 'module', 'exports', source)(require, module, module.exports); return module.exports; };
const game = { id: 'vigilante-red-city', version: '1.2.0', gameType: 'desktop', title: 'Vigilante' };
const install = version => ({ id: game.id, version, installPath: '/games/vigilante' });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('landing page follows new releases, install completion, failures and late snapshots', async t => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const focus = new Map(), events = {};
  globalThis.window = { addEventListener: (name, cb) => focus.set(name, cb), removeEventListener: name => focus.delete(name) };
  let installed = { [game.id]: install('1.1.0') }, catalog = [{ ...game }], downloads = 0, finish, late;
  const subscribe = name => cb => { events[name] = cb; return () => delete events[name]; };
  const bridge = {
    getConfig: async () => ({ autoUpdate: false }), getInstalledGames: async () => installed,
    refreshCatalog: async () => late ? late : catalog,
    downloadGame: async () => { downloads++; return new Promise(resolve => { finish = resolve; }); },
    checkLauncherUpdate: async () => {}, onDownloadProgress: subscribe('progress'),
    onInstalledGamesUpdated: subscribe('installed'), onGameStatusChanged: subscribe('status'),
    onLauncherUpdateReady: subscribe('ready'), onLauncherUpdateAvailable: subscribe('available')
  };
  globalThis[stateKey] = { bridge };
  const { App } = load(bundled.outputFiles[0].text);
  let view;
  await act(async () => { view = create(React.createElement(App)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
  t.after(async () => { await act(async () => view.unmount()); delete globalThis[stateKey]; await fs.rm(root, { recursive: true, force: true }); });
  const get = name => view.root.findByType(name).props;
  await act(async () => get('LibraryGrid').onSelectGame(game.id));
  assert.equal(get('GameHero').status, 'UPDATE_AVAILABLE');

  // Open detail during a download, as real users do via the sidebar.
  await act(async () => { void get('GameHero').onInstall(game.id); await flush(); });
  await act(async () => get('Sidebar').onSelectGame(game.id));
  assert.equal(get('GameHero').status, 'DOWNLOADING');
  await act(async () => events.progress({ gameId: game.id, phase: 'EXTRACTING' }));
  assert.equal(get('GameHero').status, 'EXTRACTING');
  // Real Electron event order: installed snapshot, COMPLETED; no separate status event.
  installed = { [game.id]: install('1.2.0') };
  await act(async () => { events.installed(installed); events.progress({ gameId: game.id, phase: 'COMPLETED' }); finish(true); await flush(); });
  assert.equal(get('GameHero').status, 'INSTALLED');
  assert.equal(get('GameHero').installed.version, '1.2.0');
  assert.equal(get('GameHero').downloadProgress, undefined);

  catalog = [{ ...game, version: '1.3.0' }];
  await act(async () => { focus.get('focus')(); await flush(); });
  assert.equal(get('GameHero').game.version, '1.3.0');
  assert.equal(get('GameHero').status, 'UPDATE_AVAILABLE');
  // Failed update leaves the existing installation and exposes retry, never a busy button.
  await act(async () => { void get('GameHero').onInstall(game.id); await flush(); });
  await act(async () => get('Sidebar').onSelectGame(game.id));
  await act(async () => { events.progress({ gameId: game.id, phase: 'ERROR', error: 'network' }); finish(false); await flush(); });
  assert.equal(get('GameHero').status, 'UPDATE_AVAILABLE');
  assert.equal(get('GameHero').installed.version, '1.2.0');
  assert.equal(downloads, 2);

  // A slow refresh started before installation must not roll the installed version back.
  let resolveLate;
  late = new Promise(resolve => { resolveLate = resolve; });
  await act(async () => { focus.get('focus')(); await flush(); });
  installed = { [game.id]: install('1.4.0') };
  await act(async () => events.installed(installed));
  await act(async () => { resolveLate(catalog); late = null; await flush(); });
  assert.equal(get('GameHero').installed.version, '1.4.0');
  assert.equal(get('GameHero').status, 'INSTALLED');
});

const timeBundle = await build({ entryPoints: [fileURLToPath(new URL('../utils/downloadTime.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs' });
const { formatDownloadETA } = load(timeBundle.outputFiles[0].text);
test('remaining download time uses whole seconds across minute boundaries', () => {
  for (const [seconds, expected] of [[.12, '1s remaining'], [12.345, '13s remaining'], [59.99, '1m 0s remaining'], [61.1, '1m 2s remaining'], [0, 'Calculating...'], [Infinity, 'Calculating...']]) {
    assert.equal(formatDownloadETA(seconds), expected);
  }
});
