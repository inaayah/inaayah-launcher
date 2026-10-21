import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022'
});
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
);

const baseEnv = {
  GITHUB_ORG: 'inaayah',
  GITHUB_TOKEN: 'test-read-token',
  CACHE_TTL_SECONDS: 604800,
  CACHE_REVISION: 'test-v1',
  EMAIL_FROM: 'Inaayah Studio <noreply@inaayah.dev>',
  ADMIN_EMAILS: 'sazid@inaayah.dev,admin@inaayah.dev',
  ALLOW_DEV_OTP_PREVIEW: 'true'
};

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

beforeEach((t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: new MemoryCache() } });
  t.after(() => (original ? Object.defineProperty(globalThis, 'caches', original) : delete globalThis.caches));
});

function jsonReq(path, method = 'GET', body = undefined, token = undefined) {
  return new Request(`https://releases.inaayah.dev${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('unverified user cannot log in until 6-digit email OTP is verified', async () => {
  // 1. Register player account
  const regRes = await worker.fetch(
    jsonReq('/api/auth/register', 'POST', {
      email: 'player1@example.com',
      password: 'StrongPassword123!',
      displayName: 'CyberSamurai',
      platform: 'darwin',
      appVersion: '0.2.13'
    }),
    baseEnv,
    {}
  );
  assert.equal(regRes.status, 200);
  const regData = await regRes.json();
  assert.equal(regData.status, 'VERIFICATION_REQUIRED');
  assert.equal(regData.sender, 'Inaayah Studio <noreply@inaayah.dev>');
  assert.match(regData.devOtpCode, /^\d{6}$/);

  // 2. Attempt to login before verifying -> must be rejected with 403 EMAIL_NOT_VERIFIED
  const earlyLoginRes = await worker.fetch(
    jsonReq('/api/auth/login', 'POST', {
      email: 'player1@example.com',
      password: 'StrongPassword123!'
    }),
    baseEnv,
    {}
  );
  assert.equal(earlyLoginRes.status, 403);
  const earlyLoginData = await earlyLoginRes.json();
  assert.equal(earlyLoginData.code, 'EMAIL_NOT_VERIFIED');
  const activeOtp = earlyLoginData.devOtpCode;

  // 3. Wrong OTP fails
  const wrongOtpRes = await worker.fetch(
    jsonReq('/api/auth/verify-email', 'POST', {
      email: 'player1@example.com',
      code: '000000'
    }),
    baseEnv,
    {}
  );
  assert.equal(wrongOtpRes.status, 400);

  // 4. Correct OTP succeeds and issues session token
  const verifyRes = await worker.fetch(
    jsonReq('/api/auth/verify-email', 'POST', {
      email: 'player1@example.com',
      code: activeOtp,
      deviceId: 'dev-mac-001',
      platform: 'darwin',
      appVersion: '0.2.13'
    }),
    baseEnv,
    {}
  );
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.status, 'AUTHENTICATED');
  assert.equal(verifyData.user.email, 'player1@example.com');
  assert.equal(verifyData.user.role, 'player');
  assert.equal(verifyData.user.emailVerified, true);
  assert.ok(verifyData.token.startsWith('inay_'));

  // 5. Regular player is forbidden (403) from viewing studio analytics
  const analyticsForbidden = await worker.fetch(
    jsonReq('/api/analytics/overview', 'GET', undefined, verifyData.token),
    baseEnv,
    {}
  );
  assert.equal(analyticsForbidden.status, 403);
});

test('admin email in ADMIN_EMAILS receives admin role and can view detailed studio analytics', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/repos/inaayah/inaayah-launcher/releases/latest')) {
      return Response.json({
        tag_name: 'v0.2.13',
        name: 'Inaayah Launcher v0.2.13',
        assets: [
          { id: 1, name: 'Inaayah-Launcher-0.2.13-arm64-mac.dmg', size: 95000000, download_count: 42 },
          { id: 2, name: 'Inaayah-Launcher-Setup-0.2.13.exe', size: 88000000, download_count: 58 }
        ]
      });
    }
    if (String(url).includes('/releases/latest')) {
      return Response.json({
        tag_name: 'v1.2.0',
        name: 'Release v1.2.0',
        assets: [{ id: 10, name: 'game-macos.zip', size: 400000000, download_count: 35 }]
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  // Register admin account
  const regRes = await worker.fetch(
    jsonReq('/api/auth/register', 'POST', {
      email: 'sazid@inaayah.dev',
      password: 'AdminSecretPassword99!',
      displayName: 'Sazid (Studio Owner)',
      platform: 'darwin',
      appVersion: '0.2.13'
    }),
    baseEnv,
    {}
  );
  assert.equal(regRes.status, 200);
  const { devOtpCode } = await regRes.json();

  const verifyRes = await worker.fetch(
    jsonReq('/api/auth/verify-email', 'POST', {
      email: 'sazid@inaayah.dev',
      code: devOtpCode,
      deviceId: 'admin-macbook-pro',
      platform: 'darwin',
      appVersion: '0.2.13'
    }),
    baseEnv,
    {}
  );
  assert.equal(verifyRes.status, 200);
  const { token, user } = await verifyRes.json();
  assert.equal(user.role, 'admin');

  // Record a telemetry heartbeat from a Windows player device
  await worker.fetch(
    jsonReq('/api/telemetry/heartbeat', 'POST', {
      deviceId: 'win-rig-77',
      platform: 'win32',
      appVersion: '0.2.13',
      eventType: 'game_download',
      gameId: 'vigilante-red-city',
      gameVersion: '1.2.0'
    }),
    baseEnv,
    {}
  );

  // Admin fetches /api/analytics/overview
  const analyticsRes = await worker.fetch(
    jsonReq('/api/analytics/overview', 'GET', undefined, token),
    baseEnv,
    {}
  );
  assert.equal(analyticsRes.status, 200);
  const stats = await analyticsRes.json();
  assert.equal(stats.senderEmail, 'Inaayah Studio <noreply@inaayah.dev>');
  assert.equal(stats.summary.githubReleaseDownloads, 100);
  assert.ok(stats.summary.totalLauncherDownloads >= 100);
  assert.ok(stats.summary.verifiedUsers >= 2);
  assert.ok(stats.summary.onlineNow >= 2);
  assert.ok(stats.platformBreakdown.darwin >= 1);
  assert.ok(stats.platformBreakdown.win32 >= 1);
  assert.ok(Array.isArray(stats.recentUsers));
  assert.ok(stats.recentUsers.some((u) => u.email === 'sazid@inaayah.dev' && u.role === 'admin'));
});

test('production worker never leaks devOtpCode when ALLOW_DEV_OTP_PREVIEW is not enabled and locks out brute-force logins', async () => {
  const prodEnv = {
    ...baseEnv,
    ALLOW_DEV_OTP_PREVIEW: undefined,
    RESEND_API_KEY: undefined
  };

  // Without RESEND_API_KEY and without ALLOW_DEV_OTP_PREVIEW === 'true', registration returns 503 and never leaks OTP
  const regProd = await worker.fetch(
    jsonReq('/api/auth/register', 'POST', {
      email: 'secure@example.com',
      password: 'StrongPassword123!',
      displayName: 'SecurePlayer'
    }),
    prodEnv,
    {}
  );
  assert.equal(regProd.status, 503);
  const regProdBody = await regProd.json();
  assert.equal(regProdBody.devOtpCode, undefined);

  // Brute-force login protection: 5 wrong password attempts trigger 429 lockout on the 6th attempt
  for (let i = 0; i < 5; i++) {
    const res = await worker.fetch(
      jsonReq('/api/auth/login', 'POST', {
        email: 'sazid@inaayah.dev',
        password: `WrongPass_${i}`
      }),
      baseEnv,
      {}
    );
    assert.equal(res.status, 401);
  }
  const lockedRes = await worker.fetch(
    jsonReq('/api/auth/login', 'POST', {
      email: 'sazid@inaayah.dev',
      password: 'AdminSecretPassword99!'
    }),
    baseEnv,
    {}
  );
  assert.equal(lockedRes.status, 429);
});

