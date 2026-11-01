/**
 * Canonical studio CDN roots:
 * - Brand symbols & icons (`inaayah/brand-symbol` -> `inaayah-cdn` R2 bucket): https://cdn.inaayah.dev/brand/*
 * - Game cover art, banners & screenshots: https://inaayah.dev/images/*
 */
export const BRAND_CDN_BASE_URL = 'https://cdn.inaayah.dev/brand';
export const IMAGES_CDN_BASE_URL = 'https://inaayah.dev/images';

/**
 * Resolves a canonical studio brand asset from the R2-backed edge CDN (`https://cdn.inaayah.dev/brand/*`).
 */
export function getBrandAssetUrl(filename: string): string {
  const clean = filename.replace(/^[/\\]+/, '').replace(/^brand[/\\]+/, '').split('?')[0];
  return `${BRAND_CDN_BASE_URL}/${clean}`;
}

/**
 * Resolves the bundled local fallback path (`./brand/<filename>`) for offline desktop launcher resilience.
 */
export function getLocalBrandFallbackUrl(filename: string): string {
  const clean = filename.replace(/^[/\\]+/, '').replace(/^brand[/\\]+/, '').split('?')[0];
  return `./brand/${clean}`;
}

/**
 * Resolves local image, brand symbol, and game asset paths cleanly in both Vite dev mode
 * (http://localhost:5173) and Electron production mode (file:// protocol on macOS, Windows, and Linux).
 *
 * - Brand assets (`brand/*`) resolve to the canonical R2-backed edge CDN (`https://cdn.inaayah.dev/brand/*`).
 * - Game cover/banner assets resolve to `https://inaayah.dev/images/*`.
 */
export function getAssetUrl(rawPath: string | undefined | null): string {
  if (!rawPath) return '';

  // Intercept any raw.githubusercontent.com URLs to avoid private repo 404s and rate limits
  if (rawPath.includes('raw.githubusercontent.com')) {
    const filename = rawPath.split('/').pop()?.split('?')[0];
    if (filename) {
      if (rawPath.includes('sundered-depths')) {
        if (filename.includes('cover')) return `${IMAGES_CDN_BASE_URL}/sundered-depths-cover.jpg`;
        if (filename.includes('banner')) return `${IMAGES_CDN_BASE_URL}/sundered-depths-banner.jpg`;
      }
      return `${IMAGES_CDN_BASE_URL}/${filename}`;
    }
  }

  // Upgrade any legacy https://inaayah.dev/brand/* URLs to the canonical R2 brand CDN (https://cdn.inaayah.dev/brand/*)
  if (/^https?:\/\/(www\.)?inaayah\.dev\/brand\//i.test(rawPath)) {
    const filename = rawPath.split('/brand/').pop()?.split('?')[0];
    if (filename) {
      return getBrandAssetUrl(filename);
    }
  }

  // Preserve external web URLs (including https://cdn.inaayah.dev/*), data URLs, and blob URLs
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

  // Route studio brand symbols & icons (e.g. "brand/inaayah-symbol.svg") to the R2-backed CDN (https://cdn.inaayah.dev/brand/*)
  if (path.startsWith('brand/')) {
    return getBrandAssetUrl(path.slice('brand/'.length));
  }

  // If path is a game asset (e.g. aether-rush, sundered-depths, kettle-court, cyber-tactics, eyetest),
  // route to Cloudflare edge CDN so packaged desktop launchers without bundled new images load them seamlessly
  const filename = path.split('/').pop()?.split('?')[0] || '';
  if (/^(aether-rush|sundered-depths|kettle-court|cyber-tactics|eyetest)/i.test(filename)) {
    return `${IMAGES_CDN_BASE_URL}/${filename}`;
  }

  // If path is a bare image filename (e.g. "aether-rush-cover.jpg"), route it to images/
  if (
    !path.startsWith('images/') &&
    !path.startsWith('brand/') &&
    /\.(jpg|jpeg|png|webp|svg|gif|ico)$/i.test(path)
  ) {
    path = 'images/' + path;
  }

  // Always use a relative path starting with "./" so that inside file:///.../dist/index.html
  // Chromium resolves relative to the current directory (dist/), not the root of the file system (C:\)
  return './' + path;
}
