/**
 * Resolves local image and asset paths cleanly in both Vite dev mode (http://localhost:5173)
 * and Electron production mode (file:// protocol on macOS, Windows, and Linux).
 * 
 * Free CDN Hosting: Automatically transforms any legacy GitHub raw links into
 * free, fast Cloudflare edge-cached assets served directly from https://inaayah.dev/images/.
 */
export function getAssetUrl(rawPath: string | undefined | null): string {
  if (!rawPath) return '';

  // Intercept any raw.githubusercontent.com URLs to avoid private repo 404s and rate limits
  if (rawPath.includes('raw.githubusercontent.com')) {
    const filename = rawPath.split('/').pop()?.split('?')[0];
    if (filename) {
      if (rawPath.includes('sundered-depths')) {
        if (filename.includes('cover')) return 'https://inaayah.dev/images/sundered-depths-cover.jpg';
        if (filename.includes('banner')) return 'https://inaayah.dev/images/sundered-depths-banner.jpg';
      }
      return 'https://inaayah.dev/images/' + filename;
    }
  }

  // Preserve external web URLs, data URLs, and blob URLs
  if (
    rawPath.startsWith('http://') ||
    rawPath.startsWith('https://') ||
    rawPath.startsWith('data:') ||
    rawPath.startsWith('blob:')
  ) {
    return rawPath;
  }

  // Handle Windows drive path prefix if any (e.g. "/C:/images/..." or "C:\images\...")
  let path = rawPath.replace(/^[/\\]*([a-zA-Z]:[/\\]+)?/, '');

  // Strip leading slashes, backslashes, and relative dots
  path = path.replace(/^[./\\]+/, '');

  // If path is an icon reference
  if (path === 'icon.png' || path.endsWith('/icon.png')) {
    return './icon.png';
  }

  // If path is a bare image filename (e.g. "aether-rush-cover.jpg"), route it to images/
  if (
    !path.startsWith('images/') &&
    /\.(jpg|jpeg|png|webp|svg|gif|ico)$/i.test(path)
  ) {
    path = 'images/' + path;
  }

  // Always use a relative path starting with "./" so that inside file:///.../dist/index.html
  // Chromium resolves relative to the current directory (dist/), not the root of the file system (C:\)
  return './' + path;
}
