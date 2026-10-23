export function formatDownloadETA(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Calculating...';
  const wholeSeconds = Math.ceil(seconds);
  if (wholeSeconds < 60) return `${wholeSeconds}s remaining`;
  return `${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s remaining`;
}
