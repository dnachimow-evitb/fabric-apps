import { useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/theme.context';
import { ALL_FILTERS, fetchMetrics, slicerKey, type Filters } from '@/lib/c360';
import { FilterBar } from '@/components/FilterBar';
import { applyFilterChange, filterOptions } from '@/lib/filter-options';
import { Combobox, type ComboOption } from '@/components/Combobox';
import { cn } from '@/lib/utils';
import { CustomerView } from '@/views/CustomerView';
import { PortfolioView } from '@/views/PortfolioView';
import { RiskView } from '@/views/RiskView';
import { IdentityView } from '@/views/IdentityView';

type View = 'portfolio' | 'risk' | 'customer' | 'identity';

const VIEW_LABEL: Record<View, string> = { portfolio: 'Portfolio', risk: 'Risk', customer: 'Customer 360', identity: 'Identity' };

function App() {
  const { isDark, toggleTheme } = useTheme();
  const [view, setView] = useState<View>('portfolio');
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Customer snapshot rows depend on the slicers only, so changing the date range doesn't refetch them.
  const metrics = useQuery(`metrics:${slicerKey(filters)}`, () => fetchMetrics(filters));
  // Unfiltered list for the customer picker and the filter options.
  const everyone = useQuery('metrics:all', () => fetchMetrics(ALL_FILTERS));

  // Slicers are dependent: each lists only values that exist under the other selections (e.g. region → states).
  const options = useMemo(() => filterOptions(everyone.data ?? [], filters), [everyone.data, filters]);
  const changeFilters = (next: Filters) => setFilters((prev) => applyFilterChange(everyone.data ?? [], prev, next));

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
            {(['portfolio', 'risk', 'customer', 'identity'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}
                className={cn('rounded-md px-300 py-100 font-heading text-300 font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === v ? 'bg-primary text-primary-foreground' : 'opacity-80 hover:opacity-100')}>
                {VIEW_LABEL[v]}
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
        {view === 'portfolio' || view === 'risk' ? (
          <FilterBar filters={filters} onChange={changeFilters} options={options} showDate={view === 'portfolio'} />
        ) : view === 'customer' ? (
          <div className="flex flex-wrap items-end gap-300">
            <button type="button" onClick={() => setView('portfolio')}
              className="font-heading text-300 font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              ← Portfolio
            </button>
            <CustomerPicker rows={everyone.data ?? []} value={selected} onChange={setCustomerId} />
          </div>
        ) : null}

        {view === 'portfolio'
          ? <PortfolioView filters={filters} metrics={metrics} onOpenCustomer={openCustomer} onFilters={changeFilters} />
          : view === 'risk'
          ? <RiskView filters={filters} onOpenCustomer={openCustomer} />
          : view === 'identity'
          ? <IdentityView onOpenCustomer={openCustomer} />
          : selected
            ? <CustomerView key={selected} id={selected} metric={selectedMetric} />
            : <p className="text-300 text-muted-foreground">Loading customers…</p>}
      </main>
    </div>
  );
}

function CustomerPicker({ rows, value, onChange }: {
  rows: { unifiedCustomerId?: string | null; customerName?: string | null; customerType?: string | null; city?: string | null; state?: string | null }[];
  value: string | null; onChange: (id: string) => void;
}) {
  const options = useMemo<ComboOption[]>(() => [...rows]
    .sort((a, b) => (b.customerType ?? '').localeCompare(a.customerType ?? '') || (a.customerName ?? '').localeCompare(b.customerName ?? ''))
    .map((r) => ({
      value: r.unifiedCustomerId ?? '',
      label: r.customerName ?? '',
      hint: [r.customerType, r.city && r.state ? `${r.city}, ${r.state}` : null].filter(Boolean).join(' · '),
    })), [rows]);
  return (
    <Combobox label="Customer" value={value ?? ''} onChange={onChange} options={options}
      placeholder="Search by name, type or city…" widthClass="min-w-[calc(var(--spacing-800)*10)]" />
  );
}

export default App;
