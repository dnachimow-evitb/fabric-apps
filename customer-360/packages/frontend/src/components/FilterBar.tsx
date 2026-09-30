import { useState } from 'react';
import { CalendarRange, SlidersHorizontal, X } from 'lucide-react';

import { Combobox, type ComboOption } from '@/components/Combobox';

import {
  ALL_FILTERS, DATE_PRESETS, FIRST_MONTH, LAST_MONTH, cityLabel, presetRange, rangeLabel, type DatePreset, type Filters,
} from '@/lib/c360';
import type { FilterOptions } from '@/lib/filter-options';
import { cn } from '@/lib/utils';

const FIELD = 'rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const TYPE_LABEL: Record<string, string> = { Wholesale: 'Wholesale (B2B)', Direct: 'Direct (B2C)' };

const opts = (xs: readonly string[]): ComboOption[] => xs.map((x) => ({ value: x, label: x }));

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
            <Combobox label="Period" value={filters.range.preset} onChange={(v) => setPreset(v as DatePreset)}
              options={DATE_PRESETS.map((p) => ({ value: p.id, label: p.label }))} placeholder="Search periods…" />
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
        <Combobox label="Customer type" value={filters.customerType} allLabel="All customers"
          onChange={(v) => set({ customerType: v as Filters['customerType'] })}
          options={options.customerTypes.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))} />
        <Combobox label="Region" value={filters.region} allLabel="All regions" onChange={(v) => set({ region: v })} options={opts(options.regions)} />
        <Combobox multiple label="State" value={filters.states} allLabel="All states" onChange={(states) => set({ states })} options={opts(options.states)} />
        <Combobox label="Account owner" value={filters.owner} allLabel="All owners" onChange={(v) => set({ owner: v })} options={opts(options.owners)} />
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
          <Combobox label="Churn risk" value={filters.riskBand} allLabel="Any risk" onChange={(v) => set({ riskBand: v })} options={opts(options.riskBands)} />
          <Combobox label="Lifecycle" value={filters.lifecycle} allLabel="Any stage" onChange={(v) => set({ lifecycle: v })} options={opts(options.lifecycles)} />
          <Combobox label="Buys product line" value={filters.productLine} allLabel="Any product line"
            onChange={(v) => set({ productLine: v })} options={opts(options.productLines)} />
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
