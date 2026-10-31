import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../game-download-auth.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { fetchGamePackage } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const base = { gateway: 'https://releases.inaayah.dev', gameId: 'vigilante-red-city', url: 'https://releases.inaayah.dev/api/games/vigilante-red-city/assets/1.2.0/patch.bin', sessionToken: 'inay_fixture' };

test('session reaches only the game gateway; Range survives signed CDN redirects', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([url, init]);
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: 'https://cdn.test/package?signature=fixture' } });
    if (calls.length === 2) return new Response(null, { status: 307, headers: { Location: 'https://storage.test/package' } });
    return new Response('x', { status: 206 });
  };
  assert.equal((await fetchGamePackage({ ...base, fetcher, headers: { Range: 'bytes=5-5', 'Accept-Encoding': 'identity', Cookie: 'no' } })).status, 206);
  assert.equal(calls[0][1].headers.get('Authorization'), 'Bearer inay_fixture');
  for (const [, init] of calls) {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.get('Range'), 'bytes=5-5');
    assert.equal(init.headers.get('Accept-Encoding'), 'identity');
    assert.equal(init.headers.get('Cookie'), null);
  }
  for (const [, init] of calls.slice(1)) assert.equal(init.headers.get('Authorization'), null);
});
test('missing/local sessions and arbitrary package overrides never start a protected download', async () => {
  const fetcher = () => { throw new Error('Should not fetch'); };
  for (const sessionToken of [undefined, '', 'inay_local_abc']) await assert.rejects(fetchGamePackage({ ...base, sessionToken, fetcher }), /Sign in/);
  await assert.rejects(fetchGamePackage({ ...base, url: 'https://other.test/game.zip', fetcher }), /Inaayah release service/);
});
test('downgrades, credential-bearing URLs, redirect loops and rejected sessions fail clearly', async () => {
  for (const location of ['http://cdn.test/package', 'https://user:password@cdn.test/package']) {
    let calls = 0;
    await assert.rejects(fetchGamePackage({ ...base, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { Location: location } }); } }), /Unsafe/);
    assert.equal(calls, 1);
  }
  await assert.rejects(fetchGamePackage({ ...base, fetcher: async () => new Response(null, { status: 302, headers: { Location: base.url } }) }), /Too many/);
  for (const status of [401, 403]) await assert.rejects(fetchGamePackage({ ...base, fetcher: async () => new Response(null, { status }) }), /session expired/);
});
