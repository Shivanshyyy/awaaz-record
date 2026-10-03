export function formatMB(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
