/**
 * Resolves local image and asset paths cleanly in both Vite dev mode (http://localhost:5173)
 * and Electron production mode (file:// protocol on macOS, Windows, and Linux).
 */
export function getAssetUrl(rawPath: string | undefined | null): string {
  if (!rawPath) return '';

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
    path = `images/${path}`;
  }

  // Always use a relative path starting with "./" so that inside file:///.../dist/index.html
  // Chromium resolves relative to the current directory (dist/), not the root of the file system (C:\)
  return `./${path}`;
}
