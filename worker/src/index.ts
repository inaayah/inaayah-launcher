export interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_ORG: string;
  CACHE_TTL_SECONDS: number;
}

const REGISTERED_GAMES: Record<string, { repo: string; branch: string; type: 'desktop' | 'web'; webUrl?: string }> = {
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

    // 2. GET /api/games -> list registered catalog
    if (pathname === '/api/games') {
      const results: any[] = [];
      for (const [id, game] of Object.entries(REGISTERED_GAMES)) {
        try {
          const manifest = await fetchGameManifest(id, game.repo, game.branch, env);
          results.push(manifest);
        } catch {
          results.push({ id, status: 'offline', type: game.type, webUrl: game.webUrl });
        }
      }
      return new Response(JSON.stringify(results, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${env.CACHE_TTL_SECONDS || 300}`
        }
      });
    }

    // 3. GET /api/games/:id/manifest
    const manifestMatch = pathname.match(/^\/api\/games\/([^/]+)\/manifest$/);
    if (manifestMatch) {
      const gameId = manifestMatch[1];
      const gameConfig = REGISTERED_GAMES[gameId];
      if (!gameConfig) {
        return new Response(JSON.stringify({ error: `Game ${gameId} not found in catalog` }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      try {
        const manifest = await fetchGameManifest(gameId, gameConfig.repo, gameConfig.branch, env);
        return new Response(JSON.stringify(manifest, null, 2), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${env.CACHE_TTL_SECONDS || 300}`
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. GET /api/games/:id/releases/latest
    const releaseMatch = pathname.match(/^\/api\/games\/([^/]+)\/releases\/latest$/);
    if (releaseMatch) {
      const gameId = releaseMatch[1];
      const gameConfig = REGISTERED_GAMES[gameId];
      if (!gameConfig) {
        return new Response(JSON.stringify({ error: 'Game not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      try {
        const releaseData = await fetchLatestRelease(gameConfig.repo, env);
        return new Response(JSON.stringify(releaseData, null, 2), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${env.CACHE_TTL_SECONDS || 300}`
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. GET /api/games/:id/download/:platform (e.g. darwin, win32, linux)
    const downloadMatch = pathname.match(/^\/api\/games\/([^/]+)\/download\/([^/]+)$/);
    if (downloadMatch) {
      const gameId = downloadMatch[1];
      const platform = downloadMatch[2]; // darwin | win32 | linux
      const gameConfig = REGISTERED_GAMES[gameId];

      if (!gameConfig) {
        return new Response('Game not found', { status: 404, headers: CORS_HEADERS });
      }

      try {
        const downloadUrl = await getReleaseAssetDownloadUrl(gameConfig.repo, platform, env);
        // Redirect directly to the signed AWS S3 CDN asset download
        return Response.redirect(downloadUrl, 302);
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Endpoint not found', { status: 404, headers: CORS_HEADERS });
  }
};

async function fetchGameManifest(gameId: string, repo: string, branch: string, env: Env): Promise<any> {
  const org = env.GITHUB_ORG || 'inaayah';
  const rawUrl = `https://raw.githubusercontent.com/${org}/${repo}/${branch}/game-manifest.json`;

  const headers: Record<string, string> = {
    'User-Agent': 'Inaayah-Releases-Worker'
  };
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const res = await fetch(rawUrl, {
    headers,
    cf: {
      cacheTtl: env.CACHE_TTL_SECONDS || 300,
      cacheEverything: true
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch manifest for ${repo} (HTTP ${res.status})`);
  }

  return res.json();
}

async function fetchLatestRelease(repo: string, env: Env): Promise<any> {
  const org = env.GITHUB_ORG || 'inaayah';
  const apiUrl = `https://api.github.com/repos/${org}/${repo}/releases/latest`;

  const headers: Record<string, string> = {
    'User-Agent': 'Inaayah-Releases-Worker',
    Accept: 'application/vnd.github+json'
  };
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const res = await fetch(apiUrl, {
    headers,
    cf: {
      cacheTtl: env.CACHE_TTL_SECONDS || 300,
      cacheEverything: true
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch latest release from GitHub API (HTTP ${res.status})`);
  }

  const data: any = await res.json();
  return {
    version: data.tag_name,
    name: data.name,
    publishedAt: data.published_at,
    body: data.body,
    assets: (data.assets || []).map((a: any) => ({
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      id: a.id
    }))
  };
}

async function getReleaseAssetDownloadUrl(repo: string, platform: string, env: Env): Promise<string> {
  const org = env.GITHUB_ORG || 'inaayah';
  const apiUrl = `https://api.github.com/repos/${org}/${repo}/releases/latest`;

  const headers: Record<string, string> = {
    'User-Agent': 'Inaayah-Releases-Worker',
    Accept: 'application/vnd.github+json'
  };
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const res = await fetch(apiUrl, { headers });
  if (!res.ok) throw new Error(`Could not query release for ${repo}`);

  const release: any = await res.json();
  const assets: any[] = release.assets || [];

  // Match platform keywords
  const targetAsset = assets.find((a) => {
    const name = a.name.toLowerCase();
    if (platform === 'darwin' || platform === 'mac' || platform === 'macos') {
      return name.includes('mac') || name.includes('darwin');
    }
    if (platform === 'win32' || platform === 'windows') {
      return name.includes('win');
    }
    if (platform === 'linux') {
      return name.includes('linux');
    }
    return false;
  });

  if (!targetAsset) {
    throw new Error(`No matching release asset found for platform '${platform}' in ${release.tag_name}`);
  }

  // Get S3 signed redirect from GitHub asset API
  const assetDownloadApi = `https://api.github.com/repos/${org}/${repo}/releases/assets/${targetAsset.id}`;
  const assetRes = await fetch(assetDownloadApi, {
    method: 'GET',
    headers: {
      ...headers,
      Accept: 'application/octet-stream'
    },
    redirect: 'manual'
  });

  const location = assetRes.headers.get('Location');
  if (location) {
    return location;
  }

  return targetAsset.browser_download_url;
}
