import { useState } from 'react';
import { CalendarRange, SlidersHorizontal, X } from 'lucide-react';

import {
  ALL_FILTERS, DATE_PRESETS, FIRST_MONTH, LAST_MONTH, LIFECYCLE_STAGES, RISK_BANDS, presetRange, rangeLabel,
  type DatePreset, type Filters,
} from '@/lib/c360';
import { cn } from '@/lib/utils';

export interface FilterOptions { regions: string[]; states: string[]; owners: string[]; productLines: string[] }

const FIELD = 'rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Select({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-100', className)}>
      <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, 'min-w-[calc(var(--spacing-800)*4.5)]')}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const opt = (all: string, xs: readonly string[]): [string, string][] => [['all', all], ...xs.map((x) => [x, x] as [string, string])];

export function FilterBar({ filters, onChange, options, showDate = true }: {
  filters: Filters; onChange: (f: Filters) => void; options: FilterOptions; showDate?: boolean;
}) {
  const [more, setMore] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const setPreset = (p: DatePreset) => set({ range: presetRange(p, { from: filters.range.from, to: filters.range.to }) });
  const setCustom = (from: string, to: string) => set({ range: presetRange('custom', { from, to }) });

  const active: [string, () => void][] = [];
  if (filters.customerType !== 'all') active.push([filters.customerType, () => set({ customerType: 'all' })]);
  if (filters.region !== 'all') active.push([filters.region, () => set({ region: 'all' })]);
  if (filters.state !== 'all') active.push([filters.state, () => set({ state: 'all' })]);
  if (filters.owner !== 'all') active.push([filters.owner, () => set({ owner: 'all' })]);
  if (filters.riskBand !== 'all') active.push([`${filters.riskBand} risk`, () => set({ riskBand: 'all' })]);
  if (filters.lifecycle !== 'all') active.push([filters.lifecycle, () => set({ lifecycle: 'all' })]);
  if (filters.productLine !== 'all') active.push([`Buys ${filters.productLine}`, () => set({ productLine: 'all' })]);
  if (filters.proOnly) active.push(['Pro members', () => set({ proOnly: false })]);
  const extraCount = [filters.riskBand, filters.lifecycle, filters.productLine].filter((v) => v !== 'all').length + (filters.proOnly ? 1 : 0);

  return (
    <div className="flex flex-col gap-300 rounded-lg border border-border bg-card p-400" role="group" aria-label="Filters">
      <div className="flex flex-wrap items-end gap-300">
        {showDate && (
          <>
            <Select label="Period" value={filters.range.preset} onChange={(v) => setPreset(v as DatePreset)}
              options={DATE_PRESETS.map((p) => [p.id, p.label])} />
            {filters.range.preset === 'custom' && (
              <div className="flex items-end gap-200">
                <label className="flex flex-col gap-100">
                  <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">From</span>
                  <input type="month" min={FIRST_MONTH} max={LAST_MONTH} value={filters.range.from}
                    onChange={(e) => e.target.value && setCustom(e.target.value, filters.range.to)} className={FIELD} />
                </label>
                <label className="flex flex-col gap-100">
                  <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">To</span>
                  <input type="month" min={FIRST_MONTH} max={LAST_MONTH} value={filters.range.to}
                    onChange={(e) => e.target.value && setCustom(filters.range.from, e.target.value)} className={FIELD} />
                </label>
              </div>
            )}
          </>
        )}
        <Select label="Customer type" value={filters.customerType} onChange={(v) => set({ customerType: v as Filters['customerType'] })}
          options={[['all', 'All customers'], ['Wholesale', 'Wholesale (B2B)'], ['Direct', 'Direct (B2C)']]} />
        <Select label="Region" value={filters.region} onChange={(v) => set({ region: v })} options={opt('All regions', options.regions)} />
        <Select label="State" value={filters.state} onChange={(v) => set({ state: v })} options={opt('All states', options.states)} />
        <Select label="Account owner" value={filters.owner} onChange={(v) => set({ owner: v })} options={opt('All owners', options.owners)} />
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
          className={cn('inline-flex items-center gap-100 self-end rounded-md border px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            more || extraCount ? 'border-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground')}>
          <SlidersHorizontal aria-hidden className="icon-size-200" />More filters{extraCount ? ` (${extraCount})` : ''}
        </button>
        {showDate && (
          <p className="ml-auto flex items-center gap-100 self-end text-200 text-muted-foreground">
            <CalendarRange aria-hidden className="icon-size-200" />
            {rangeLabel(filters.range)} · scores as of 28 Sep 2026
          </p>
        )}
      </div>

      {more && (
        <div className="flex flex-wrap items-end gap-300 border-t border-border pt-300">
          <Select label="Churn risk" value={filters.riskBand} onChange={(v) => set({ riskBand: v })} options={opt('Any risk', RISK_BANDS)} />
          <Select label="Lifecycle" value={filters.lifecycle} onChange={(v) => set({ lifecycle: v })} options={opt('Any stage', LIFECYCLE_STAGES)} />
          <Select label="Buys product line" value={filters.productLine} onChange={(v) => set({ productLine: v })}
            options={opt('Any product line', options.productLines)} />
          <label className="flex items-center gap-200 self-end py-200 text-300">
            <input type="checkbox" checked={filters.proOnly} onChange={(e) => set({ proOnly: e.target.checked })}
              className="size-400 accent-[color:var(--color-primary)]" />
            Pro members only
          </label>
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-200">
          {active.map(([label, clear]) => (
            <button key={label} type="button" onClick={clear} aria-label={`Remove filter ${label}`}
              className="inline-flex items-center gap-100 rounded-full bg-muted px-300 py-100 text-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {label}<X aria-hidden className="icon-size-100" />
            </button>
          ))}
          <button type="button" onClick={() => onChange({ ...ALL_FILTERS, range: filters.range })}
            className="text-200 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Clear all</button>
        </div>
      )}
    </div>
  );
}
