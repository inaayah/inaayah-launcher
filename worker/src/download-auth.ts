import { authenticateRequest } from './auth-analytics';
import { verifyReleaseIdentity } from './release-sync';
import type { Env } from './index';

export function requiresLauncherSignIn(gameId: string, env: Env): boolean {
  return (env.LAUNCHER_AUTH_GAMES || '').split(',').map(id => id.trim()).includes(gameId);
}

export function isMobilePackage(gameId: string, name: string): boolean {
  return gameId === 'vigilante-red-city' && /\.(apk|aab|apks)$/i.test(name);
}

// Called before looking up or reading cached signed URLs. Headers, Origin and
// User-Agent alone cannot grant access. CI uses its existing verified identity.
export async function authorizeGameDownload(request: Request, env: Env, gameId: string, repo: string, version?: string): Promise<Response | null> {
  if (!requiresLauncherSignIn(gameId, env)) return null;
  const headers = {
    'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store', Vary: 'Authorization'
  };
  const denied = () => Response.json({ code: 'LAUNCHER_SIGN_IN_REQUIRED',
    error: 'Sign in to an up-to-date Inaayah Launcher to download this game.',
    launcherUrl: 'https://inaayah.dev/games#launcher' }, { status: 401, headers });
  const ciVersion = request.headers.get('X-Inaayah-Release-Version');
  if (ciVersion) {
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !/^\d+\.\d+\.\d+$/.test(ciVersion) || (version && version !== ciVersion)) return denied();
    try {
      await verifyReleaseIdentity(token, `${env.GITHUB_ORG || 'inaayah'}/${repo}`, ciVersion);
      return null;
    } catch { return denied(); }
  }
  try { return await authenticateRequest(request, env) ? null : denied(); }
  catch { return Response.json({ error: 'Download sign-in verification is temporarily unavailable. Please retry.' }, { status: 503, headers }); }
}
