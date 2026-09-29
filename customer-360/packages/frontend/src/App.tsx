import { useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/theme.context';
import { ALL_FILTERS, fetchMetrics, type Filters } from '@/lib/c360';
import { cn } from '@/lib/utils';
import { CustomerView } from '@/views/CustomerView';
import { PortfolioView } from '@/views/PortfolioView';

type View = 'portfolio' | 'customer';

function App() {
  const { isDark, toggleTheme } = useTheme();
  const [view, setView] = useState<View>('portfolio');
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const metrics = useQuery(`metrics:${JSON.stringify(filters)}`, () => fetchMetrics(filters));
  // Unfiltered list for the customer picker and the filter options.
  const everyone = useQuery('metrics:all', () => fetchMetrics(ALL_FILTERS));

  const options = useMemo(() => {
    const rows = everyone.data ?? [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return { regions: uniq(rows.map((r) => r.region)), owners: uniq(rows.map((r) => r.accountManager)) };
  }, [everyone.data]);

  const openCustomer = (id: string) => { setCustomerId(id); setView('customer'); window.scrollTo({ top: 0 }); };
  const selected = customerId ?? [...(everyone.data ?? [])].sort((a, b) => Number(b.priorityScore ?? 0) - Number(a.priorityScore ?? 0))[0]?.unifiedCustomerId ?? null;
  const selectedMetric = everyone.data?.find((r) => r.unifiedCustomerId === selected);

  return (
    <div className="min-h-full bg-background">
      <header className="border-b-4 border-primary bg-[color:var(--color-header)] text-[color:var(--color-header-foreground)]">
        <div className="mx-auto flex max-w-[calc(var(--spacing-800)*44)] flex-wrap items-center justify-between gap-300 px-600 py-300">
          <div className="flex items-baseline gap-300">
            <span className="font-heading text-500 font-bold uppercase tracking-widest">Contoso Hardware</span>
            <h1 className="font-heading text-300 uppercase tracking-wider opacity-70">Customer 360</h1>
          </div>
          <nav className="flex items-center gap-100" aria-label="Views">
            {(['portfolio', 'customer'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}
                className={cn('rounded-md px-300 py-100 font-heading text-300 font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === v ? 'bg-primary text-primary-foreground' : 'opacity-80 hover:opacity-100')}>
                {v === 'portfolio' ? 'Portfolio' : 'Customer 360'}
              </button>
            ))}
            <button type="button" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="ml-200 rounded-md p-100 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {isDark ? <Sun className="icon-size-300" /> : <Moon className="icon-size-300" />}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-[calc(var(--spacing-800)*44)] flex-col gap-400 px-600 py-500">
        {view === 'portfolio' ? (
          <div className="flex flex-wrap items-end gap-300" role="group" aria-label="Filters">
            <Select label="Customer type" value={filters.customerType}
              onChange={(v) => setFilters({ ...filters, customerType: v as Filters['customerType'] })}
              options={[['all', 'All customers'], ['Wholesale', 'Wholesale (B2B)'], ['Direct', 'Direct (B2C)']]} />
            <Select label="Region" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })}
              options={[['all', 'All regions'], ...options.regions.map((r) => [r, r] as [string, string])]} />
            <Select label="Account owner" value={filters.owner} onChange={(v) => setFilters({ ...filters, owner: v })}
              options={[['all', 'All owners'], ...options.owners.map((o) => [o, o] as [string, string])]} />
            <p className="ml-auto text-200 text-muted-foreground">Test data · scores as of 28 Sep 2026</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-300">
            <button type="button" onClick={() => setView('portfolio')}
              className="font-heading text-300 font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              ← Portfolio
            </button>
            <CustomerPicker rows={everyone.data ?? []} value={selected} onChange={setCustomerId} />
          </div>
        )}

        {view === 'portfolio'
          ? <PortfolioView filters={filters} metrics={metrics} onOpenCustomer={openCustomer} />
          : selected
            ? <CustomerView key={selected} id={selected} metric={selectedMetric} />
            : <p className="text-300 text-muted-foreground">Loading customers…</p>}
      </main>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-100">
      <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="min-w-[calc(var(--spacing-800)*5)] rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function CustomerPicker({ rows, value, onChange }: {
  rows: { unifiedCustomerId?: string | null; customerName?: string | null; customerType?: string | null }[];
  value: string | null; onChange: (id: string) => void;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.customerType ?? '').localeCompare(b.customerType ?? '') * -1
    || (a.customerName ?? '').localeCompare(b.customerName ?? '')), [rows]);
  return (
    <label className="flex flex-col gap-100">
      <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Customer</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="min-w-[calc(var(--spacing-800)*10)] rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {sorted.map((r) => (
          <option key={r.unifiedCustomerId} value={r.unifiedCustomerId ?? ''}>{r.customerName} — {r.customerType}</option>
        ))}
      </select>
    </label>
  );
}

export default App;
