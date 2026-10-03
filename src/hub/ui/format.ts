/** Number and time formatting for labels and counters. */

const grouped = new Intl.NumberFormat('en-US');

export function formatNumber(n: number): string {
  return grouped.format(Math.round(n));
}

/** Short form for tight spaces: 950, 12,400, 125K, 1.2M. */
export function formatCompact(n: number): string {
  const v = Math.round(n);
  if (v >= 10_000_000) return `${Math.floor(v / 1_000_000)}M`;
  if (v >= 1_000_000) return `${(Math.floor(v / 100_000) / 10).toFixed(1)}M`;
  if (v >= 100_000) return `${Math.floor(v / 1000)}K`;
  return formatNumber(v);
}

/** Countdown text: "2d 5h", "5h 12m", "12m 05s", "45s". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** "cellsCaptured" → "Cells captured", for stats games report under their own names. */
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Joins truthy class names. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
