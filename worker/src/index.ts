export interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_ORG: string;
  CACHE_TTL_SECONDS: number;
  CACHE_REVISION?: string;
}

const REGISTERED_GAMES: Record<string, { repo: string; branch: string; type: 'desktop' | 'web'; webUrl?: string; isComingSoon?: boolean }> = {
  'vigilante-red-city': {
    repo: 'vigilante-red-city',
    branch: 'main',
    type: 'desktop'
  },
  'aether-rush': {
    repo: 'aether-rush',
    branch: 'main',
    type: 'desktop'
  },
  'kettle-court': {
    repo: 'kettle-court',
    branch: 'main',
    type: 'web',
    webUrl: 'https://kettle-court.inaayah.dev/'
  },
  'sundered-depths': {
    repo: 'sundered-depths',
    branch: 'main',
    type: 'desktop',
    isComingSoon: true
  },
  'cyber-tactics': {
    repo: 'cyber-tactics',
    branch: 'main',
    type: 'desktop',
    isComingSoon: true
  }
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Health check
    if (pathname === '/' || pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'inaayah-releases-gateway', time: new Date().toISOString() }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 2. GET /api/games -> list registered catalog dynamically from games-catalog.json
    if (pathname === '/api/games') {
      const catalog = await getDynamicCatalog(env);
      return new Response(JSON.stringify(catalog, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // 3. GET /api/games/:id/manifest
    const manifestMatch = pathname.match(/^\/api\/games\/([^/]+)\/manifest$/);
    if (manifestMatch) {
      const gameId = manifestMatch[1];
      const catalog = await getDynamicCatalog(env);
      const game = catalog.find((g: any) => g.id === gameId);
      if (!game) {
        return new Response(JSON.stringify({ error: `Game ${gameId} not found in catalog` }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      return new Response(JSON.stringify(game, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // 4. GET /api/games/:id/releases/latest
    const releaseMatch = pathname.match(/^\/api\/games\/([^/]+)\/releases\/latest$/);
    if (releaseMatch) {
      const gameId = releaseMatch[1];
      const gameConfig = REGISTERED_GAMES[gameId];
      if (!gameConfig) {
        return new Response(JSON.stringify({ error: 'Game not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      try {
        const releaseData = await fetchLatestRelease(gameConfig.repo, env);
        return new Response(JSON.stringify(releaseData, null, 2), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
    }

    // Immutable release assets support byte ranges after the secure CDN redirect.
    const assetMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)\/assets\/(\d+\.\d+\.\d+)\/([a-zA-Z0-9._-]+)$/);
    if (assetMatch) {
      const [, gameId, version, name] = assetMatch;
      const repo = REGISTERED_GAMES[gameId]?.repo;
      if (!repo) return new Response('Game not found', { status: 404, headers: CORS_HEADERS });
      try {
        const release = await fetchTaggedRelease(repo, version, env);
        const asset = release.assets.find((a: any) => a.name === name);
        if (!asset) return new Response('Asset not found', { status: 404, headers: CORS_HEADERS });
        const location = await assetDownloadUrl(repo, asset.id, env);
        return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: location, 'Cache-Control': 'no-store' } });
      } catch {
        return new Response('Release asset unavailable', { status: 503, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
      }
    }

    // 5. GET /api/games/:id/download/:platform (e.g. darwin, win32, linux)
    const downloadMatch = pathname.match(/^\/api\/games\/([^/]+)\/download\/([^/]+)$/);
    if (downloadMatch) {
      const gameId = downloadMatch[1];
      const platform = downloadMatch[2]; // darwin | win32 | linux
      const repo = REGISTERED_GAMES[gameId]?.repo;

      if (!repo) {
        return new Response('Game or repository not found', { status: 404, headers: CORS_HEADERS });
      }

      try {
        const downloadUrl = await getReleaseAssetDownloadUrl(repo, platform, env);
        // Redirect directly to the signed AWS S3 CDN asset download
        return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: downloadUrl, 'Cache-Control': 'no-store' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
    }

    // 6. GET /api/launcher/releases/latest or /api/launcher/latest
    if (pathname === '/api/launcher/releases/latest' || pathname === '/api/launcher/latest') {
      try {
        const releaseData = await fetchLatestRelease('inaayah-launcher', env);
        return new Response(JSON.stringify(releaseData, null, 2), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
    }

    // 7. GET /api/launcher/download/:platform (e.g. windows, mac, linux)
    const launcherDlMatch = pathname.match(/^\/api\/launcher\/download\/([^\/]+)$/);
    if (launcherDlMatch) {
      const platform = launcherDlMatch[1];
      const format = url.searchParams.get('format');
      try {
        const downloadUrl = await getReleaseAssetDownloadUrl('inaayah-launcher', platform, env, format);
        return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: downloadUrl, 'Cache-Control': 'no-store' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
    }

        return new Response('Endpoint not found', { status: 404, headers: CORS_HEADERS });
  }
};

function githubHeaders(env: Env, accept = 'application/vnd.github+json'): Record<string, string> {
  return {
    'User-Agent': 'Inaayah-Releases-Worker',
    Accept: accept,
    ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {})
  };
}

async function cachedJSON<T>(key: string, env: Env, load: () => Promise<T>, ttl = env.CACHE_TTL_SECONDS || 604800, limitTTL?: (data: T) => number): Promise<T> {
  const revision = encodeURIComponent(env.CACHE_REVISION || 'initial');
  const org = encodeURIComponent(env.GITHUB_ORG || 'inaayah');
  const cacheKey = new Request(`https://releases.inaayah.dev/__inaayah_cache/${revision}/${org}/${key}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json() as Promise<T>;

  // Fetch failures never enter the cache. Only successful, decoded data is stored.
  const data = await load();
  if (limitTTL) ttl = Math.min(ttl, limitTTL(data));
  if (ttl > 0) {
    await cache.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }));
  }
  return data;
}

async function fetchLatestRelease(repo: string, env: Env): Promise<any> {
  return cachedJSON(`releases/${repo}/latest`, env, async () => {
    const org = env.GITHUB_ORG || 'inaayah';
    const response = await fetch(`https://api.github.com/repos/${org}/${repo}/releases/latest`, {
      headers: githubHeaders(env),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Failed to fetch latest release from GitHub API (HTTP ${response.status})`);
    const data: any = await response.json();
    if (typeof data.tag_name !== 'string' || !Array.isArray(data.assets)) throw new Error('Invalid GitHub release metadata');
    return {
      version: data.tag_name,
      name: data.name,
      publishedAt: data.published_at,
      body: data.body,
      assets: (data.assets || []).map((asset: any) => ({
        name: asset.name, size: asset.size, downloadCount: asset.download_count, id: asset.id
      }))
    };
  });
}

async function fetchTaggedRelease(repo: string, version: string, env: Env): Promise<any> {
  return cachedJSON(`releases/${repo}/tags/v${version}`, env, async () => {
    const org = env.GITHUB_ORG || 'inaayah';
    const response = await fetch(`https://api.github.com/repos/${org}/${repo}/releases/tags/v${version}`, { headers: githubHeaders(env), cache: 'no-store' });
    if (!response.ok) throw new Error('Release not found');
    const data: any = await response.json();
    if (data.tag_name !== `v${version}` || !Array.isArray(data.assets)) throw new Error('Invalid tagged release');
    return { version: data.tag_name, assets: data.assets.map((a: any) => ({ name: a.name, size: a.size, id: a.id })) };
  });
}

async function assetDownloadUrl(repo: string, id: number, env: Env): Promise<string> {
  const entry = await cachedJSON(`signed/${repo}/${id}`, env, async () => ({
    url: signedRedirect(await githubAsset(repo, id, env))
  }), 60, entry => signedLinkTTL(entry.url));
  return entry.url;
}

async function githubAsset(repo: string, id: number, env: Env): Promise<Response> {
  const org = env.GITHUB_ORG || 'inaayah';
  return fetch(`https://api.github.com/repos/${org}/${repo}/releases/assets/${id}`, {
    headers: githubHeaders(env, 'application/octet-stream'), redirect: 'manual', cache: 'no-store'
  });
}

function signedRedirect(response: Response): string {
  const location = response.headers.get('Location');
  if (!location || new URL(location).protocol !== 'https:') {
    throw new Error(`GitHub did not provide a secure asset redirect (HTTP ${response.status})`);
  }
  return location;
}

async function fetchReleaseManifest(repo: string, release: any, env: Env): Promise<any | null> {
  const asset = release.assets.find((item: any) => item.name === 'game-manifest.json');
  if (!asset) return null;
  return cachedJSON(`manifests/${repo}/${asset.id}`, env, async () => {
    let response = await githubAsset(repo, asset.id, env);
    if (response.status >= 300 && response.status < 400) {
      // Never forward the private GitHub token to the signed download host.
      response = await fetch(signedRedirect(response), { cache: 'no-store' });
    }
    if (!response.ok) throw new Error(`Could not fetch published manifest (HTTP ${response.status})`);
    const manifest: any = await response.json();
    if (manifest.version !== release.version.replace(/^v/, '')) throw new Error('Published manifest version does not match release');
    return manifest;
  });
}

function signedLinkTTL(location: string): number {
  const url = new URL(location);
  let expires = Date.parse(url.searchParams.get('se') || '');
  const stamp = url.searchParams.get('X-Amz-Date');
  const duration = Number(url.searchParams.get('X-Amz-Expires'));
  if (stamp && duration > 0 && /^\d{8}T\d{6}Z$/.test(stamp)) {
    expires = Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')) + duration * 1000;
  }
  return Number.isFinite(expires) ? Math.max(0, Math.min(60, Math.floor((expires - Date.now() - 5000) / 1000))) : 60;
}

async function getReleaseAssetDownloadUrl(repo: string, platform: string, env: Env, format?: string | null): Promise<string> {
  const release = await fetchLatestRelease(repo, env);
  const matchesPlatform = (name: string) => {
    if (['darwin', 'mac', 'macos'].includes(platform)) return name.includes('mac') || name.includes('darwin') || name.endsWith('.dmg');
    if (['win32', 'windows', 'win'].includes(platform)) return name.includes('win') || name.endsWith('.exe');
    if (platform === 'linux') return name.includes('linux') || name.endsWith('.appimage') || name.endsWith('.tar.gz');
    return false;
  };
  const assets = release.assets.filter((asset: any) => {
    const name = asset.name.toLowerCase();
    return matchesPlatform(name) && !name.endsWith('.blockmap') && !name.endsWith('.yml');
  });
  let asset = format === 'zip' ? assets.find((item: any) => item.name.toLowerCase().endsWith('.zip')) : null;
  asset ||= assets.find((item: any) => /\.(dmg|exe|appimage)$/i.test(item.name));
  asset ||= assets.find((item: any) => /\.(zip|tar\.gz)$/i.test(item.name));
  if (!asset) throw new Error(`No matching release asset found for platform '${platform}' in ${release.version}`);

  // Signed links expire independently of metadata. Reuse them for only one minute.
  return assetDownloadUrl(repo, asset.id, env);
}

function catalogArtwork(item: any, env: Env): any {
  const resolve = (value: any) => {
    if (typeof value !== 'string' || !value) return value;
    try {
      const url = new URL(value, 'https://inaayah.dev/');
      if (url.hostname === 'inaayah.dev' && url.pathname.startsWith('/images/')) {
        url.searchParams.set('v', env.CACHE_REVISION || 'initial');
        return url.toString();
      }
    } catch {}
    return value;
  };
  return { ...item, icon: resolve(item.icon), coverArt: resolve(item.coverArt), heroBanner: resolve(item.heroBanner),
    ...(Array.isArray(item.screenshots) ? { screenshots: item.screenshots.map(resolve) } : {}) };
}

async function getDynamicCatalog(env: Env): Promise<any[]> {
  const org = env.GITHUB_ORG || 'inaayah';
  try {
    const data = await cachedJSON<any[]>('catalog-source', env, async () => {
      const response = await fetch(`https://raw.githubusercontent.com/${org}/inaayah-launcher/main/games-catalog.json`, {
        headers: githubHeaders(env), cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Could not fetch game catalog (HTTP ${response.status})`);
      const catalog: any = await response.json();
      if (!Array.isArray(catalog) || !catalog.length) throw new Error('Game catalog is empty');
      return catalog;
    });
    await Promise.all(data.map(async (item: any) => {
      if (item.gameType !== 'desktop' || item.isComingSoon) return;
      const repo = REGISTERED_GAMES[item.id]?.repo || item.githubRepo?.replace(/^[^/]+\//, '');
      if (!repo) return;
      try {
        const release = await fetchLatestRelease(repo, env);
        const manifest = await fetchReleaseManifest(repo, release, env);
        if (manifest) {
          if (manifest.id !== item.id) throw new Error('Published manifest game ID does not match catalog');
          Object.assign(item, manifest);
        }
        item.version = release.version.replace(/^v/, '');
        if (release.publishedAt && !manifest) {
          item.releaseDate = new Date(release.publishedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      } catch (error) {
        console.warn(`Release metadata unavailable for ${repo}; using catalog entry`);
      }
    }));
    return data.map(item => catalogArtwork(item, env));
  } catch (error) {
    console.error('Failed to load game catalog; using registered games');
  }
  return Object.entries(REGISTERED_GAMES).map(([id, game]) => ({
    id, slug: id,
    title: id === 'vigilante-red-city' ? 'Vigilante: Red City' : id === 'aether-rush' ? 'AetherRush: Cyber Brawler 3D' : id === 'kettle-court' ? 'Kettle Court: Court of Kettle' : 'Cyber Tactics',
    gameType: game.type, webUrl: game.webUrl, githubRepo: `${org}/${game.repo}`, isComingSoon: game.isComingSoon
  }));
}
