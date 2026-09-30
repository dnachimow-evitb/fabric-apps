import { useMemo, useState } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { InteractionEvent } from '@microsoft/fabric-visuals-core';
import usStates from 'us-atlas/states-10m.json';
import { X } from 'lucide-react';

import { Empty } from '@/components/ui';
import { useChartColors } from '@/lib/chart-colors';
import { rangeLabel, type CityTotals, type Filters, type MetricRow } from '@/lib/c360';
import { count, money, pct } from '@/lib/format';
import { cn } from '@/lib/utils';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

interface CityPoint {
  city: string; state: string; lat: number; lon: number;
  customers: number; highRisk: number; risk: number; churn: number; upsell: number;
  sales: number; orders: number; returns: number; returnRate: number; tickets: number; engagement: number;
}

type MetricKey = 'sales' | 'orders' | 'returns' | 'returnRate' | 'tickets' | 'engagement' | 'customers' | 'risk' | 'churn' | 'highRisk' | 'upsell';

const METRICS: { key: MetricKey; label: string; range: boolean; fmt: (v: number) => string; vega: string }[] = [
  { key: 'sales', label: 'Net sales', range: true, fmt: money, vega: '$,.0f' },
  { key: 'orders', label: 'Orders', range: true, fmt: count, vega: ',.0f' },
  { key: 'returns', label: 'Returns ($)', range: true, fmt: money, vega: '$,.0f' },
  { key: 'returnRate', label: 'Return rate', range: true, fmt: (v) => pct(v), vega: '.1%' },
  { key: 'tickets', label: 'Support tickets', range: true, fmt: count, vega: ',.0f' },
  { key: 'engagement', label: 'Marketing engagement rate', range: true, fmt: (v) => pct(v), vega: '.1%' },
  { key: 'customers', label: 'Customers', range: false, fmt: count, vega: ',.0f' },
  { key: 'risk', label: 'Revenue at risk', range: false, fmt: money, vega: '$,.0f' },
  { key: 'churn', label: 'Average churn risk', range: false, fmt: (v) => v.toFixed(0), vega: '.0f' },
  { key: 'highRisk', label: 'High-risk customers', range: false, fmt: count, vega: ',.0f' },
  { key: 'upsell', label: 'Upsell opportunity', range: false, fmt: money, vega: '$,.0f' },
];

export function CustomerMap({ metrics, cities, filters, onState }: {
  metrics: MetricRow[]; cities: CityTotals[]; filters: Filters; onState: (state: string | 'all') => void;
}) {
  // Clicking the state that is already selected (or empty map space) clears the filter.
  const toggleState = (state: string) => onState(filters.state === state ? 'all' : state);
  const theme = useCssTheme();
  const c = useChartColors();
  const [metric, setMetric] = useState<MetricKey>('sales');
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];

  const points = useMemo<CityPoint[]>(() => {
    const byCity = new Map<string, CityPoint>();
    for (const r of metrics) {
      if (r.latitude == null || r.longitude == null || !r.city) continue;
      const k = `${r.city}|${r.state}`;
      const p = byCity.get(k) ?? { city: r.city, state: r.state ?? '', lat: n(r.latitude), lon: n(r.longitude), customers: 0, highRisk: 0,
        risk: 0, churn: 0, upsell: 0, sales: 0, orders: 0, returns: 0, returnRate: 0, tickets: 0, engagement: 0 };
      p.customers += 1;
      p.highRisk += r.churnRiskBand === 'High' ? 1 : 0;
      p.risk += n(r.revenueAtRisk);
      p.churn += n(r.churnRiskScore);
      p.upsell += n(r.upsellValueEst);
      byCity.set(k, p);
    }
    for (const t of cities) {
      const p = byCity.get(`${t.city}|${t.state}`);
      if (!p) continue;
      p.sales = t.netSales; p.orders = t.orders; p.returns = t.returns; p.tickets = t.tickets;
      p.returnRate = t.netSales ? t.returns / t.netSales : 0;
      p.engagement = t.touches ? t.engagements / t.touches : 0;
    }
    return [...byCity.values()].map((p) => ({ ...p, churn: p.customers ? p.churn / p.customers : 0 }));
  }, [metrics, cities]);

  const ranked = [...points].sort((a, b) => b[metric] - a[metric]);
  const spec = useMemo<VisualizationSpec>(() => ({
    projection: { type: 'albersUsa' },
    layer: [
      {
        data: { values: usStates, format: { type: 'topojson', feature: 'states' } },
        mark: { type: 'geoshape', fill: c.border, stroke: c.muted, strokeWidth: 0.4, fillOpacity: 0.35 },
      },
      {
        data: { values: points },
        mark: { type: 'circle', stroke: c.muted, strokeWidth: 0.6, cursor: 'pointer' },
        encoding: {
          longitude: { field: 'lon', type: 'quantitative' },
          latitude: { field: 'lat', type: 'quantitative' },
          size: { field: metric, type: 'quantitative', scale: { range: [40, 1800] }, legend: null },
          color: { field: metric, type: 'quantitative', scale: { range: [c.series1Light, c.series1] }, title: m.label,
            legend: { orient: 'bottom', format: m.vega, gradientLength: 180 } },
          tooltip: [
            { field: 'city', title: 'City' }, { field: 'state', title: 'State' },
            { field: metric, title: m.label, format: m.vega },
            { field: 'customers', title: 'Customers', format: ',.0f' },
          ],
        },
      },
    ],
  }), [points, metric, m, c]);

  const onInteraction = (events: InteractionEvent[]) => {
    for (const e of events) {
      if (e.action === 'clear') {
        if (filters.state !== 'all') onState('all');
        continue;
      }
      const p = e.selections[0]?.predicates.find((x) => x.name === 'state');
      if (p?.type === 'set' && typeof p.values[0] === 'string') toggleState(p.values[0]);
    }
  };

  if (!points.length) return <Empty>No customers with a location match these filters.</Empty>;
  return (
    <div className="flex flex-col gap-300">
      <div className="flex flex-wrap items-center gap-200" role="group" aria-label="Map metric">
        <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Show</span>
        <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} aria-label="Map metric"
          className="rounded-md border border-input bg-card px-300 py-100 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <optgroup label={`For ${rangeLabel(filters.range)}`}>
            {METRICS.filter((x) => x.range).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </optgroup>
          <optgroup label="Current snapshot">
            {METRICS.filter((x) => !x.range).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </optgroup>
        </select>
        <span className="text-200 text-muted-foreground">
          {m.range ? rangeLabel(filters.range) : 'as of 28 Sep 2026'} · click a city to filter by its state, click it again to clear
        </span>
        {filters.state !== 'all' && (
          <button type="button" onClick={() => onState('all')} aria-label={`Clear the ${filters.state} filter`}
            className="ml-auto inline-flex items-center gap-100 rounded-full bg-primary px-300 py-100 text-200 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Filtered to {filters.state}<X aria-hidden className="icon-size-100" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-400 xl:grid-cols-[3fr_1fr]">
        <VegaVisual spec={spec} theme={theme} style={{ height: 'calc(var(--spacing-800) * 13)' }} onInteraction={onInteraction} />
        <ol className="flex flex-col divide-y divide-border text-300" aria-label={`Cities ranked by ${m.label}`}>
          {ranked.slice(0, 10).map((p, i) => (
            <li key={`${p.city}-${p.state}`} className="flex items-center justify-between gap-200 py-100">
              <button type="button" onClick={() => toggleState(p.state)} aria-pressed={filters.state === p.state}
                className={cn('min-w-0 truncate text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filters.state === p.state && 'font-semibold')}>
                <span className="mr-100 tabular-nums text-muted-foreground">{i + 1}.</span>{p.city}, {p.state}
              </button>
              <span className="shrink-0 tabular-nums">{m.fmt(p[metric])}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
