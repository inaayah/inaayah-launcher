import type { Env } from './index';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'https://releases.inaayah.dev';
let signingKeys: { expires: number; keys: Array<JsonWebKey & { kid?: string }> } | undefined;

function decode(part: string): Uint8Array {
  return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

export async function verifyReleaseIdentity(token: string, repo: string, version: string): Promise<void> {
  if (token.length > 16384) throw new Error('Invalid release identity');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid release identity');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid signing algorithm');
  if (!signingKeys || signingKeys.expires < Date.now() || !signingKeys.keys.some(k => k.kid === header.kid)) {
    const response = await fetch(`${ISSUER}/.well-known/jwks`, { cache: 'no-store' });
    if (!response.ok) throw new Error('GitHub identity keys unavailable');
    const data: any = await response.json();
    if (!Array.isArray(data.keys)) throw new Error('Invalid GitHub identity keys');
    signingKeys = { expires: Date.now() + 300000, keys: data.keys };
  }
  const jwk = signingKeys.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown GitHub signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) {
    throw new Error('Invalid release signature');
  }
  const now = Math.floor(Date.now() / 1000);
  const workflow = repo.endsWith('/inaayah-launcher') ? 'release-launcher.yml' : 'release.yml';
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.repository !== repo ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 30 ||
      !['push', 'workflow_dispatch'].includes(claims.event_name) ||
      !['refs/heads/main', `refs/tags/v${version}`].includes(claims.ref) ||
      claims.workflow_ref !== `${repo}/.github/workflows/${workflow}@${claims.ref}`) {
    throw new Error('Release workflow identity is not authorized');
  }
}

export async function withPublishedRevision(env: Env): Promise<Env> {
  if (!env.DB) return env;
  const row = await env.DB.prepare("SELECT revision FROM release_cache_state WHERE id = 'global'").first<{ revision: string }>();
  return row ? { ...env, CACHE_REVISION: `${env.CACHE_REVISION || 'initial'}-${row.revision}` } : env;
}

export async function synchronizeRelease(request: Request, env: Env, repos: Record<string, { repo: string }>): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (request.method !== 'POST') return fail('Use POST', 405);
  let body: any;
  try { body = await request.json(); } catch { return fail('Invalid request', 400); }
  const { gameId, version: suppliedVersion } = body;
  const version = typeof suppliedVersion === 'string' ? suppliedVersion.replace(/^v/, '') : '';
  const repo = gameId === 'launcher' ? 'inaayah-launcher' : repos[gameId]?.repo;
  if (!repo || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return fail('Unknown game or invalid stable version', 400);
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail('GitHub Actions identity required', 401);
  try { await verifyReleaseIdentity(token, `${env.GITHUB_ORG || 'inaayah'}/${repo}`, version); }
  catch { return fail('Invalid or unauthorized GitHub Actions identity', 403); }
  if (!env.DB?.batch) return fail('Release state database unavailable', 503);
  try {
    const githubHeaders = { 'User-Agent': 'Inaayah-Release-Publisher', Accept: 'application/vnd.github+json',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
    const base = `https://api.github.com/repos/${env.GITHUB_ORG || 'inaayah'}/${repo}`;
    const response = await fetch(`${base}/releases/latest`, { headers: githubHeaders, cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`);
    const release: any = await response.json();
    if (release.tag_name !== `v${version}` || release.draft || release.prerelease || !release.published_at || !Array.isArray(release.assets)) {
      return fail('Requested version is not the latest published stable release', 409);
    }
    const assets = release.assets;
    const uploaded = (name: string) => assets.find((a: any) => a.name === name && a.state === 'uploaded' && a.size > 0);
    if (gameId === 'launcher') {
      for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
        if (!uploaded(name)) throw new Error(`Missing updater metadata: ${name}`);
      }
      for (const pattern of [/\.dmg$/i, /\.exe$/i, /\.AppImage$/i]) {
        if (!assets.some((a: any) => pattern.test(a.name) && uploaded(a.name))) throw new Error('Missing desktop installer');
      }
    } else {
      const asset = uploaded('game-manifest.json');
      if (!asset || !uploaded('SHA256SUMS.txt')) throw new Error('Release manifest or checksums missing');
      let manifestResponse = await fetch(`${base}/releases/assets/${asset.id}`, {
        headers: { ...githubHeaders, Accept: 'application/octet-stream' }, redirect: 'manual', cache: 'no-store'
      });
      if (manifestResponse.status >= 300 && manifestResponse.status < 400) {
        const location = manifestResponse.headers.get('Location');
        if (!location || new URL(location).protocol !== 'https:') throw new Error('Invalid manifest redirect');
        manifestResponse = await fetch(location, { cache: 'no-store' });
      }
      if (!manifestResponse.ok) throw new Error('Published manifest unavailable');
      const manifest: any = await manifestResponse.json();
      if (manifest.id !== gameId || manifest.version !== version) throw new Error('Published manifest identity mismatch');
      for (const platform of ['darwin', 'win32', 'linux']) {
        const download = manifest.downloads?.[platform];
        const archive = download && uploaded(download.name);
        if (!archive || archive.size !== download.sizeBytes || !/^[a-f0-9]{64}$/.test(download.sha256) ||
            (archive.digest && archive.digest !== `sha256:${download.sha256}`)) throw new Error(`Invalid ${platform} package metadata`);
        const incremental = manifest.incremental?.[platform];
        if (incremental) {
          const recipe = uploaded(incremental.manifest), payload = uploaded(incremental.data);
          if (!recipe || !payload || recipe.size !== incremental.sizeBytes || payload.size !== incremental.dataSize ||
              !/^[a-f0-9]{64}$/.test(incremental.sha256) || (recipe.digest && recipe.digest !== `sha256:${incremental.sha256}`)) {
            throw new Error(`Invalid ${platform} incremental package`);
          }
        }
      }
    }
    const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(
      [release.id, release.tag_name, assets.map((a: any) => [a.id, a.name, a.size, a.updated_at]).sort((a: any, b: any) => a[0] - b[0])]
    )));
    const fingerprint = Array.from(new Uint8Array(fingerprintBytes), b => b.toString(16).padStart(2, '0')).join('');
    const previous = await env.DB.prepare('SELECT fingerprint FROM release_publications WHERE game_id = ?').bind(gameId).first<{ fingerprint: string }>();
    const changed = previous?.fingerprint !== fingerprint;
    if (changed) {
      const revision = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO release_publications (game_id, version, fingerprint, published_at) VALUES (?, ?, ?, ?) ON CONFLICT(game_id) DO UPDATE SET version=excluded.version, fingerprint=excluded.fingerprint, published_at=excluded.published_at')
          .bind(gameId, version, fingerprint, release.published_at),
        env.DB.prepare("INSERT INTO release_cache_state (id, revision) VALUES ('global', ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision").bind(revision)
      ]);
    }
    return Response.json({ gameId, version, synchronized: true, changed }, { headers });
  } catch (error) { return fail(error instanceof Error ? error.message : 'Release synchronization failed', 503); }
}
