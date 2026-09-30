import type { ReactNode } from 'react';
import { AlertTriangle, CircleCheck, CircleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { QueryState } from '@/hooks/use-query';

export function Card({ title, subtitle, action, className, children }: {
  title?: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-border bg-card p-500 text-card-foreground', className)}>
      {(title || action) && (
        <header className="mb-400 flex items-start justify-between gap-300">
          <div className="min-w-0">
            {title && <h2 className="font-heading text-400 font-semibold uppercase tracking-wider">{title}</h2>}
            {subtitle && <p className="mt-100 text-200 text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, detail, accent, action }: {
  label: string; value: string; detail?: ReactNode; accent?: boolean; action?: ReactNode;
}) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-border bg-card p-400', accent && 'border-t-4 border-t-primary')}>
      <div className="flex items-start justify-between gap-100">
        <div className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        {action}
      </div>
      <div className="mt-200 font-[family-name:var(--font-numeric)] text-hero-700 font-semibold leading-hero-700">{value}</div>
      {detail && <div className="mt-100 text-200 text-muted-foreground">{detail}</div>}
    </div>
  );
}

const BAND = {
  High: { icon: AlertTriangle, cls: 'text-[color:var(--color-status-critical)]', label: 'High' },
  Medium: { icon: CircleAlert, cls: 'text-[color:var(--color-status-warning)]', label: 'Medium' },
  Low: { icon: CircleCheck, cls: 'text-[color:var(--color-status-good)]', label: 'Low' },
} as const;

/** Churn risk always shows icon + label + score: colour is never the only signal. */
export function RiskBadge({ band, score }: { band: string | null | undefined; score?: number | null }) {
  const b = BAND[(band as keyof typeof BAND) ?? 'Low'] ?? BAND.Low;
  const Icon = b.icon;
  return (
    <span className={cn('inline-flex items-center gap-100 whitespace-nowrap text-200 font-semibold', b.cls)}>
      <Icon aria-hidden className="icon-size-100" />
      {b.label}{score != null && <span className="text-foreground">· {score}</span>}
    </span>
  );
}

export function Meter({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="inline-flex items-center gap-200" title={label}>
      <span className="relative h-100 w-[calc(var(--spacing-800)*2)] overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--color-series-1)]" style={{ width: `${w}%` }} />
      </span>
      <span className="text-200 tabular-nums">{Math.round(value)}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[calc(var(--spacing-800)*4)] items-center justify-center text-center text-300 text-muted-foreground">{children}</div>;
}

export function ErrorNote({ error }: { error: Error }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-300 text-300">
      <strong className="font-semibold">Couldn't load this data.</strong>{' '}
      <span className="text-muted-foreground">{error.message}</span>
    </div>
  );
}

/** Renders loading / error / success for a query; keeps stale data visible (dimmed) while refetching. */
export function Loaded<T>({ q, skeleton, children }: {
  q: QueryState<T>; skeleton: ReactNode; children: (data: T) => ReactNode;
}) {
  if (q.status === 'error' && q.data === undefined) return <ErrorNote error={q.error} />;
  if (q.data === undefined) return <>{skeleton}</>;
  return (
    <div className={cn('transition-opacity', q.status === 'loading' && 'opacity-50')}>
      {q.status === 'error' && <div className="mb-300"><ErrorNote error={q.error} /></div>}
      {children(q.data)}
    </div>
  );
}
