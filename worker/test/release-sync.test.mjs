import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const keys = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid: 'fixture-key' };
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
async function token(overrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = encode({ iss: 'https://token.actions.githubusercontent.com', aud: 'https://releases.inaayah.dev', repository: 'inaayah/vigilante-red-city',
    ref: 'refs/heads/main', workflow_ref: 'inaayah/vigilante-red-city/.github/workflows/release.yml@refs/heads/main', event_name: 'workflow_dispatch', nbf: now - 1, exp: now + 120, ...overrides });
  const header = encode({ alg: 'RS256', kid: jwk.kid, ...headerOverrides });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(`${header}.${body}`));
  return `${header}.${body}.${Buffer.from(signature).toString('base64url')}`;
}
class Cache {
  entries = new Map();
  async match(request) { return this.entries.get(request.url)?.clone(); }
  async put(request, response) { this.entries.set(request.url, response.clone()); }
}
class Database {
  revision = null;
  publications = new Map();
  writes = 0;
  prepare(sql) {
    const db = this;
    return { values: [], bind(...values) { this.values = values; return this; }, async first() {
      if (sql.includes('release_cache_state')) return db.revision ? { revision: db.revision } : null;
      if (sql.includes('release_publications')) return db.publications.get(this.values[0]) || null;
      return null;
    }, async run() {
      if (sql.startsWith('INSERT INTO release_cache_state')) db.revision = this.values[0];
      if (sql.startsWith('INSERT INTO release_publications')) db.publications.set(this.values[0], { fingerprint: this.values[2] });
      db.writes++;
      return { success: true };
    } };
  }
  async batch(statements) { return Promise.all(statements.map(s => s.run())); }
}
const digest = 'a'.repeat(64);
const manifest = { id: 'vigilante-red-city', version: '1.2.0', downloads: Object.fromEntries(['darwin', 'win32', 'linux'].map(p => [p, { name: `${p}.zip`, sizeBytes: 42, sha256: digest }])), incremental: { linux: { manifest: 'linux.json', sizeBytes: 123, sha256: digest, data: 'linux.bin', dataSize: 456 } } };
const release = { id: 12, tag_name: 'v1.2.0', published_at: '2026-10-22T00:00:00Z', draft: false, prerelease: false, assets: ['game-manifest.json', 'SHA256SUMS.txt', 'darwin.zip', 'win32.zip', 'linux.zip', 'linux.json', 'linux.bin'].map((name, i) => ({ id: i + 1, name, size: name === 'linux.json' ? 123 : name === 'linux.bin' ? 456 : 42, state: 'uploaded', digest: `sha256:${digest}` })) };
const syncRequest = async (identity = {}, header = {}) => new Request('https://releases.inaayah.dev/api/releases/sync', { method: 'POST', headers: { Authorization: `Bearer ${await token(identity, header)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: 'vigilante-red-city', version: '1.2.0' }) });
function fixture(t) {
  const env = { GITHUB_ORG: 'inaayah', GITHUB_TOKEN: 'private-read-token', CACHE_REVISION: 'deploy-1', CACHE_TTL_SECONDS: 604800, DB: new Database() };
  let latest = structuredClone(release), published = structuredClone(manifest);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/.well-known/jwks')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/releases/latest')) return Response.json(latest);
    if (url.endsWith('/releases/assets/1')) return new Response(null, { status: 302, headers: { Location: 'https://cdn.test/manifest.json' } });
    if (url === 'https://cdn.test/manifest.json') { assert.equal(init.headers?.Authorization, undefined); return Response.json(published); }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: new Cache() } });
  t.after(() => original ? Object.defineProperty(globalThis, 'caches', original) : delete globalThis.caches);
  return { env, setRelease: value => latest = value, getRelease: () => latest, getManifest: () => published };
}

test('publication refreshes warm caches at independent edge locations and is idempotent', async t => {
  const f = fixture(t);
  const read = async () => (await (await worker.fetch(new Request('https://test/api/games/vigilante-red-city/releases/latest'), f.env, {})).json()).version;
  f.setRelease({ ...release, tag_name: 'v1.1.0' });
  const edgeOne = caches.default, edgeTwo = new Cache();
  assert.equal(await read(), 'v1.1.0');
  caches.default = edgeTwo; assert.equal(await read(), 'v1.1.0');
  f.setRelease(release);
  assert.equal((await worker.fetch(await syncRequest(), f.env, {})).status, 200);
  assert.equal(await read(), 'v1.2.0');
  caches.default = edgeOne; assert.equal(await read(), 'v1.2.0');
  const revision = f.env.DB.revision;
  const retry = await worker.fetch(await syncRequest(), f.env, {});
  assert.equal((await retry.json()).changed, false);
  assert.equal(f.env.DB.revision, revision);
  assert.equal(f.env.DB.writes, 2);
});

test('invalid identity, forks, alternate workflows, feature branches and expired tokens cannot invalidate caches', async t => {
  const f = fixture(t);
  for (const claims of [{ repository: 'attacker/vigilante-red-city' }, { aud: 'other' }, { iss: 'https://attacker.test' },
    { exp: 1 }, { nbf: 9999999999 }, { ref: 'refs/heads/feature' }, { event_name: 'pull_request' },
    { workflow_ref: 'inaayah/vigilante-red-city/.github/workflows/other.yml@refs/heads/main' }]) {
    assert.equal((await worker.fetch(await syncRequest(claims), f.env, {})).status, 403);
  }
  assert.equal((await worker.fetch(await syncRequest({}, { alg: 'none' }), f.env, {})).status, 403);
  const altered = await syncRequest(); altered.headers.set('Authorization', `${altered.headers.get('Authorization').slice(0, -10)}aaaaaaaaaa`);
  assert.equal((await worker.fetch(altered, f.env, {})).status, 403);
  assert.equal(f.env.DB.writes, 0);
});

test('partial releases, wrong versions and invalid measured metadata never publish a cache revision', async t => {
  const f = fixture(t);
  for (const bad of [{ ...release, draft: true }, { ...release, prerelease: true }, { ...release, tag_name: 'v1.3.0' },
    { ...release, assets: release.assets.filter(a => a.name !== 'linux.zip') },
    { ...release, assets: release.assets.filter(a => a.name !== 'linux.bin') }]) {
    f.setRelease(bad);
    assert.notEqual((await worker.fetch(await syncRequest(), f.env, {})).status, 200);
  }
  f.setRelease(release); f.getManifest().downloads.linux.sha256 = 'b'.repeat(64);
  assert.equal((await worker.fetch(await syncRequest(), f.env, {})).status, 503);
  assert.equal(f.env.DB.writes, 0);
});

test('an exact release-tag workflow identity can publish', async t => {
  const f = fixture(t), ref = 'refs/tags/v1.2.0';
  assert.equal((await worker.fetch(await syncRequest({ ref, event_name: 'push', workflow_ref: `inaayah/vigilante-red-city/.github/workflows/release.yml@${ref}` }), f.env, {})).status, 200);
});
