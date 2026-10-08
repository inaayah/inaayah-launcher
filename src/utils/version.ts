import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version || '0.2.4';

export function compareVersions(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}
