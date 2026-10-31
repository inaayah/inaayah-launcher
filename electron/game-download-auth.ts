export class DownloadAuthorizationError extends Error {}

export function requiresLauncherSession(gameId: string): boolean {
  return gameId === 'vigilante-red-city';
}

// Follow signed CDN redirects ourselves so the account session never reaches
// GitHub/CDN hosts. Range headers must survive for incremental updates.
export async function fetchGamePackage(options: {
  gateway: string; gameId: string; url: string; sessionToken?: string;
  headers?: Record<string, string>; signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const { gameId, sessionToken, signal } = options;
  const gateway = new URL(options.gateway);
  let url = new URL(options.url);
  const gatewayPath = `/api/games/${gameId}/`;
  const isGateway = (value: URL) => value.origin === gateway.origin && value.pathname.startsWith(gatewayPath);
  const local = gateway.hostname === '127.0.0.1' || gateway.hostname === 'localhost' || gateway.hostname === '[::1]';
  if (gateway.protocol !== 'https:' && !(local && gateway.protocol === 'http:')) throw new Error('Game downloads require HTTPS.');
  if (requiresLauncherSession(gameId)) {
    if (!sessionToken || sessionToken.startsWith('inay_local_')) throw new DownloadAuthorizationError('Sign in to Inaayah Launcher to download or update this game.');
    if (!isGateway(url)) throw new Error('This game must be downloaded through the Inaayah release service.');
  }
  if (sessionToken && (sessionToken.length > 4096 || /[\r\n]/.test(sessionToken))) throw new DownloadAuthorizationError('Please sign in to Inaayah Launcher again.');
  let sendSession = isGateway(url);
  const fetcher = options.fetcher || fetch;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.origin === gateway.origin))) throw new Error('Unsafe game download redirect.');
    const headers = new Headers(options.headers);
    headers.delete('Authorization'); headers.delete('Cookie');
    headers.set('User-Agent', 'InaayahLauncher');
    if (sendSession && sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    const response = await fetcher(url.href, { redirect: 'manual', headers, signal });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new DownloadAuthorizationError('Your download session expired. Sign in to Inaayah Launcher again and retry.');
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('Location');
    await response.body?.cancel();
    if (!location) throw new Error('Game download redirect is missing.');
    url = new URL(location, url);
    // Never reattach credentials after leaving the gateway, even if redirected back.
    sendSession = sendSession && isGateway(url);
  }
  throw new Error('Too many game download redirects.');
}
