import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const env = { GITHUB_ORG: 'inaayah', GITHUB_TOKEN: 'test-read-token', CACHE_TTL_SECONDS: 604800, CACHE_REVISION: 'test-v1' };
const release = { tag_name: 'v1.0.1', name: 'Vigilante: Red City v1.0.1', assets: [
  { id: 1234, name: 'vigilante-red-city-macos-universal.zip' },
  { id: 1235, name: 'vigilante-red-city-linux-x86_64.zip' }
] };

class MemoryCache {
  entries = new Map();
  async match(request) {
    const item = this.entries.get(request.url);
    return item && item.expires > Date.now() ? item.response.clone() : undefined;
  }
  async put(request, response) {
    const ttl = Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)[1]);
    this.entries.set(request.url, { response: response.clone(), expires: Date.now() + ttl * 1000 });
  }
}
beforeEach(t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: new MemoryCache() } });
  t.after(() => original ? Object.defineProperty(globalThis, 'caches', original) : delete globalThis.caches);
});
const request = path => new Request(`https://example.test${path}`);
const latest = '/api/games/vigilante-red-city/releases/latest';

test('warm latest-release requests reuse metadata for at most two minutes', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(release));
  for (let index = 0; index < 3; index++) {
    const response = await worker.fetch(request(latest), env, {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, 'v1.0.1');
    assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  }
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[1].cache, 'no-store');
  assert.equal([...caches.default.entries.values()][0].response.headers.get('Cache-Control'), 'public, max-age=120');
});

test('permission failures are not cached, allowing a corrected token to work immediately', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => ++count === 1 ? Response.json({ message: 'Not Found' }, { status: 404 }) : Response.json(release));
  assert.equal((await worker.fetch(request(latest), env, {})).status, 500);
  const response = await worker.fetch(request(latest), env, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, 'v1.0.1');
  assert.equal(count, 2);
});

test('changing the release cache revision exposes a new release without waiting for TTL expiry', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...release, tag_name: ++count === 1 ? 'v1.0.1' : 'v1.0.2' }));
  const read = async settings => (await (await worker.fetch(request(latest), settings, {})).json()).version;
  assert.equal(await read(env), 'v1.0.1');
  assert.equal(await read(env), 'v1.0.1');
  assert.equal(await read({ ...env, CACHE_REVISION: 'test-v2' }), 'v1.0.2');
  assert.equal(count, 2);
});

test('download redirects reuse metadata briefly but refresh their signed URL after a minute', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let metadataReads = 0, signedReads = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.cache, 'no-store');
    if (url.endsWith('/releases/latest')) { metadataReads++; return Response.json(release); }
    if (url.endsWith('/releases/assets/1234')) {
      signedReads++;
      assert.equal(init.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: `https://example.test/runtime-${signedReads}.zip` } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const download = () => worker.fetch(request('/api/games/vigilante-red-city/download/darwin'), env, {});
  assert.equal((await download()).status, 302);
  assert.equal((await download()).headers.get('Location'), 'https://example.test/runtime-1.zip');
  assert.equal(metadataReads, 1);
  assert.equal(signedReads, 1);
  now += 61000;
  assert.equal((await download()).headers.get('Location'), 'https://example.test/runtime-2.zip');
  assert.equal(metadataReads, 1);
  assert.equal(signedReads, 2);
});

test('Linux ZIP selection cannot accidentally return a macOS archive', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/releases/latest')) return Response.json(release);
    assert.ok(url.endsWith('/releases/assets/1235'));
    return new Response(null, { status: 302, headers: { Location: 'https://example.test/linux.zip' } });
  });
  const response = await worker.fetch(request('/api/launcher/download/linux?format=zip'), env, {});
  assert.equal(response.headers.get('Location'), 'https://example.test/linux.zip');
});

test('catalog refresh takes measured package metadata from the published release manifest', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    if (url.includes('games-catalog.json')) return Response.json([{ id: 'vigilante-red-city', gameType: 'desktop', version: '1.0.0', downloads: { darwin: { sha256: 'old' } } }]);
    if (url.endsWith('/releases/latest')) return Response.json({ ...release, assets: [...release.assets, { id: 6789, name: 'game-manifest.json' }] });
    if (url.endsWith('/releases/assets/6789')) return new Response(null, { status: 302, headers: { Location: 'https://example.test/manifest.json' } });
    if (url === 'https://example.test/manifest.json') {
      assert.equal(init.headers?.Authorization, undefined);
      return Response.json({ id: 'vigilante-red-city', version: '1.0.1', downloads: { darwin: { sha256: 'new-measured-hash', sizeBytes: 400000000 } } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  for (let index = 0; index < 2; index++) {
    const response = await worker.fetch(request('/api/games'), env, {});
    const [game] = await response.json();
    assert.equal(game.version, '1.0.1');
    assert.equal(game.downloads.darwin.sha256, 'new-measured-hash');
    assert.equal(game.downloads.darwin.sizeBytes, 400000000);
  }
  assert.equal(calls, 4);
});

test('a signed link near its expiry is refreshed before the signature becomes invalid', async t => {
  let now = Date.now(), signedReads = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/releases/latest')) return Response.json(release);
    signedReads++;
    const expires = new Date(now + 20000).toISOString();
    return new Response(null, { status: 302, headers: { Location: `https://example.test/runtime-${signedReads}.zip?se=${encodeURIComponent(expires)}` } });
  });
  const download = () => worker.fetch(request('/api/games/vigilante-red-city/download/darwin'), env, {});
  assert.equal((await download()).status, 302);
  now += 16000;
  assert.equal((await download()).status, 302);
  assert.equal(signedReads, 2);
});

test('manual cache refresh also changes artwork URLs for existing launchers', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ id: 'kettle-court', gameType: 'web',
    coverArt: 'https://inaayah.dev/images/kettle-court-cover.jpg', heroBanner: './images/kettle-court-banner.jpg',
    screenshots: ['https://inaayah.dev/images/kettle-court-shot1.jpg'] }]));
  const response = await worker.fetch(request('/api/games'), env, {});
  const [game] = await response.json();
  assert.equal(game.coverArt, 'https://inaayah.dev/images/kettle-court-cover.jpg?v=test-v1');
  assert.equal(game.heroBanner, 'https://inaayah.dev/images/kettle-court-banner.jpg?v=test-v1');
  assert.equal(game.screenshots[0], 'https://inaayah.dev/images/kettle-court-shot1.jpg?v=test-v1');
});


test('version-pinned patch assets reuse metadata and short-lived redirects without forwarding credentials', async t => {
  let releaseReads = 0, signedReads = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/releases/tags/v1.0.2')) {
      releaseReads++;
      return Response.json({ tag_name: 'v1.0.2', assets: [{ id: 901, name: 'vigilante-red-city-darwin-chunks.bin' }] });
    }
    if (url.endsWith('/releases/assets/901')) {
      signedReads++;
      assert.equal(init.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: 'https://example.test/chunks.bin' } });
    }
    throw new Error('Unexpected request');
  });
  const asset = '/api/games/vigilante-red-city/assets/1.0.2/vigilante-red-city-darwin-chunks.bin';
  for (let i = 0; i < 3; i++) {
    const response = await worker.fetch(request(asset), env, {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://example.test/chunks.bin');
    assert.equal(response.headers.get('Authorization'), null);
  }
  assert.equal(releaseReads, 1);
  assert.equal(signedReads, 1);
  assert.equal((await worker.fetch(request(asset.replace('chunks.bin', 'absent.bin')), env, {})).status, 404);
  assert.equal((await worker.fetch(request(asset.replace('vigilante-red-city/assets', 'unregistered/assets')), env, {})).status, 404);
});
