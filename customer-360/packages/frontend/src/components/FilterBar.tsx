import { useState } from 'react';
import { CalendarRange, ChevronDown, SlidersHorizontal, X } from 'lucide-react';

import {
  ALL_FILTERS, DATE_PRESETS, FIRST_MONTH, LAST_MONTH, LIFECYCLE_STAGES, RISK_BANDS, cityLabel, presetRange, rangeLabel,
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

/** Multi-select dropdown (checkbox list in a popover). */
function MultiSelect({ label, all, values, options, onChange }: {
  label: string; all: string; values: string[]; options: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = values.length === 0 ? all : values.length <= 2 ? values.join(', ') : `${values.length} selected`;
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="relative flex flex-col gap-100">
      <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className={cn(FIELD, 'inline-flex min-w-[calc(var(--spacing-800)*4.5)] items-center justify-between gap-200 text-left')}>
        <span className="truncate">{summary}</span><ChevronDown aria-hidden className="icon-size-200 shrink-0" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable aria-label={label} onMouseLeave={() => setOpen(false)}
          className="absolute top-full z-30 mt-100 max-h-[calc(var(--spacing-800)*9)] min-w-full overflow-y-auto rounded-md border border-border bg-popover p-200 text-popover-foreground shadow-lg">
          <button type="button" onClick={() => onChange([])} className="mb-100 w-full rounded-sm px-200 py-100 text-left text-200 hover:bg-accent">{all}</button>
          {options.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-200 rounded-sm px-200 py-100 text-300 hover:bg-accent">
              <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} className="accent-[color:var(--color-primary)]" />{o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
  for (const st of filters.states) active.push([st, () => set({ states: filters.states.filter((x) => x !== st) })]);
  if (filters.cities.length) {
    const label = filters.cities.length <= 2 ? filters.cities.map(cityLabel).join(' + ') : `${filters.cities.length} cities (map)`;
    active.push([label, () => set({ cities: [] })]);
  }
  if (filters.owner !== 'all') active.push([filters.owner, () => set({ owner: 'all' })]);
  if (filters.riskBand !== 'all') active.push([`${filters.riskBand} risk`, () => set({ riskBand: 'all' })]);
  if (filters.lifecycle !== 'all') active.push([filters.lifecycle, () => set({ lifecycle: 'all' })]);
  if (filters.productLine !== 'all') active.push([`Buys ${filters.productLine}`, () => set({ productLine: 'all' })]);
  if (filters.proOnly) active.push(['Pro members', () => set({ proOnly: false })]);
  const extraCount = [filters.riskBand, filters.lifecycle, filters.productLine].filter((v) => v !== 'all').length + (filters.proOnly ? 1 : 0);

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-300 rounded-lg border border-border bg-card p-400 shadow-sm" role="group" aria-label="Filters">
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
        <MultiSelect label="State" all="All states" values={filters.states} options={options.states} onChange={(states) => set({ states })} />
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
