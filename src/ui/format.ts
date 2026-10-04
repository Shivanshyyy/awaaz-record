export function formatMB(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// Free space reads better in gigabytes once it passes a thousand megabytes.
export function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : formatMB(bytes);
}

export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
