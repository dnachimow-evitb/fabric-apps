const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? NaN : Number(v));

export function money(v: unknown): string {
  const n = num(v);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function pct(v: unknown, digits = 1): string {
  const n = num(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';
}

export function signedPct(v: unknown, digits = 0): string {
  const n = num(v);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '▲' : '▼'} ${Math.abs(n * 100).toFixed(digits)}%`;
}

export function count(v: unknown): string {
  const n = num(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';
}

export function shortDate(v: unknown): string {
  if (v == null) return '—';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
