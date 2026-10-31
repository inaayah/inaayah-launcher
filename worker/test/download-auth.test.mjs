import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { outputFiles } = await build({ stdin: { contents: `export { default as worker } from './worker/src/index.ts'; export { resetMemoryStoreForTests } from './worker/src/auth-analytics.ts';`, resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' });
const { worker, resetMemoryStoreForTests } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const env = { GITHUB_ORG: 'inaayah', CACHE_TTL_SECONDS: 120, CACHE_REVISION: 'auth-fixture', LAUNCHER_AUTH_GAMES: 'vigilante-red-city', ALLOW_DEV_OTP_PREVIEW: 'true' };
const prefix = '/api/games/vigilante-red-city';
const assets = ['vigilante-red-city-linux.zip', 'patch.json', 'patch.bin', 'private.apk'].map((name, i) => ({ id: i + 1, name, size: 42 }));
const release = { tag_name: 'v1.2.0', assets };
const keys = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid: 'download-auth-fixture' };
async function identity(overrides = {}) {
  const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', kid: jwk.kid });
  const body = encode({ iss: 'https://token.actions.githubusercontent.com', aud: 'https://releases.inaayah.dev', repository: 'inaayah/vigilante-red-city', event_name: 'push', ref: 'refs/tags/v1.2.0', workflow_ref: 'inaayah/vigilante-red-city/.github/workflows/release.yml@refs/tags/v1.2.0', nbf: now-1, exp: now+120, ...overrides });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(`${header}.${body}`));
  return `${header}.${body}.${Buffer.from(signature).toString('base64url')}`;
}
function fixture(t) {
  resetMemoryStoreForTests();
  const cache = new Map(), calls = [];
  const old = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async request => cache.get(request.url)?.clone(), put: async (request, response) => cache.set(request.url, response.clone())
  } } });
  t.after(() => old ? Object.defineProperty(globalThis, 'caches', old) : delete globalThis.caches);
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    if (url.endsWith('/.well-known/jwks')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/releases/latest') || url.endsWith('/releases/tags/v1.2.0')) return Response.json(release);
    if (url.includes('/releases/assets/')) return new Response(null, { status: 302, headers: { Location: 'https://cdn.test/private-fixture.zip' } });
    if (url.includes('games-catalog.json')) return Response.json([{ id: 'vigilante-red-city', version: '1.2.0', gameType: 'desktop' }]);
    throw new Error('Unexpected upstream request');
  });
  const call = (path, { token, headers, method = 'GET', body, settings = env } = {}) => worker.fetch(new Request(`https://releases.inaayah.dev${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), settings, {});
  const account = async () => {
    const email = 'download-fixture@example.test';
    const reg = await call('/api/auth/register', { method: 'POST', body: { email, password: 'FixturePass!123', displayName: 'Fixture' } });
    const { devOtpCode } = await reg.json();
    const verified = await call('/api/auth/verify-email', { method: 'POST', body: { email, code: devOtpCode } });
    assert.equal(verified.status, 200);
    return (await verified.json()).token;
  };
  return { call, calls, account };
}
test('all game package routes reject anonymous, fake and spoofed requests before upstream/cache reads', async t => {
  const { call, calls } = fixture(t);
  for (const path of [`${prefix}/download/linux`, `${prefix}/assets/1.2.0/patch.json`, `${prefix}/assets/1.2.0/patch.bin`]) {
    for (const token of [undefined, 'bogus', 'inay_local_fake']) {
      const response = await call(path, { token, headers: { 'User-Agent': 'InaayahLauncher', Origin: 'https://inaayah.dev', Range: 'bytes=0-0' } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('Location'), null);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal((await response.json()).code, 'LAUNCHER_SIGN_IN_REQUIRED');
    }
  }
  assert.equal(calls.length, 0);
});
test('verified sessions unlock packages and patches; warm signed caches do not bypass sign-in; logout/expiry revoke access', async t => {
  const { call, account } = fixture(t), token = await account();
  for (const path of [`${prefix}/download/linux`, `${prefix}/assets/1.2.0/patch.json`, `${prefix}/assets/1.2.0/patch.bin`]) {
    assert.equal((await call(path, { token })).status, 302);
    assert.equal((await call(path)).status, 401);
  }
  assert.equal((await call(`${prefix}/assets/1.2.0/private.apk`, { token })).status, 404);
  assert.equal((await call(`${prefix}/download/android`, { token })).status, 404);
  assert.equal((await call('/api/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await call(`${prefix}/download/linux`, { token })).status, 401);
  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'download-fixture@example.test', password: 'FixturePass!123' } });
  const fresh = (await login.json()).token;
  assert.ok(fresh);
  const realNow = Date.now();
  t.mock.method(Date, 'now', () => realNow + 366 * 86400000);
  assert.equal((await call(`${prefix}/download/linux`, { token: fresh })).status, 401);
});
test('catalog, release metadata and launcher installers remain public', async t => {
  const { call } = fixture(t);
  const catalog = await (await call('/api/games')).json();
  assert.equal(catalog[0].requiresLauncherSignIn, true);
  const latest = await (await call(`${prefix}/releases/latest`)).json();
  assert.ok(latest.assets.every(asset => !asset.name.endsWith('.apk')));
  assert.equal((await call('/api/launcher/download/linux?format=zip')).status, 302);
});
test('only signed CI identities for the correct repo, workflow and version can verify protected release assets', async t => {
  const { call } = fixture(t);
  const headers = { 'X-Inaayah-Release-Version': '1.2.0' };
  assert.equal((await call(`${prefix}/assets/1.2.0/patch.bin`, { headers, token: await identity() })).status, 302);
  for (const claims of [{ repository: 'attacker/fork' }, { exp: 1 }, { aud: 'other' }, { workflow_ref: 'inaayah/vigilante-red-city/.github/workflows/untrusted.yml@refs/tags/v1.2.0' }]) {
    assert.equal((await call(`${prefix}/assets/1.2.0/patch.bin`, { headers, token: await identity(claims) })).status, 401);
  }
  assert.equal((await call(`${prefix}/assets/1.3.0/patch.bin`, { headers, token: await identity() })).status, 401);
  assert.equal((await call(`${prefix}/download/linux`, { headers, token: 'fake' })).status, 401);
});
test('session storage failure fails closed', async t => {
  const { call } = fixture(t);
  const settings = { ...env, DB: { prepare: sql => ({ first: async () => null, bind() { return this; }, run: async () => { throw new Error('DB unavailable'); } }) } };
  assert.equal((await call(`${prefix}/download/linux`, { settings, token: 'inay_fixture' })).status, 503);
});
