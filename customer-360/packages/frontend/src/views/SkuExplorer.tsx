import { useMemo } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable, InteractionEvent } from '@microsoft/fabric-visuals-core';
import { X } from 'lucide-react';

import { Card, Empty, Kpi, Loaded, RiskBadge, Skeleton } from '@/components/ui';
import { LineageLink } from '@/components/LineageLink';
import { useQuery } from '@/hooks/use-query';
import { useChartColors } from '@/lib/chart-colors';
import {
  fetchSkuAffinity, fetchSkuBuyers, fetchSkuPerformance, type Filters, type MetricRow, type SkuPerfRow,
} from '@/lib/c360';
import { count, money, pct, shortDate, signedPct } from '@/lib/format';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

interface SkuAgg {
  sku: string; name: string; line: string; sales: number; prior: number; units: number; buyers: number;
  returns: number; defect: number; tickets: number;
}

/** Combines the per-customer-type rows for the current type filter. */
function aggregate(rows: SkuPerfRow[], f: Filters): SkuAgg[] {
  const m = new Map<string, SkuAgg>();
  for (const r of rows) {
    if (f.customerType !== 'all' && r.customerType !== f.customerType) continue;
    const k = r.sku ?? '';
    const a = m.get(k) ?? { sku: k, name: r.productName ?? k, line: r.productLine ?? '', sales: 0, prior: 0, units: 0, buyers: 0, returns: 0, defect: 0, tickets: 0 };
    a.sales += n(r.netSalesTtm); a.prior += n(r.netSalesPriorTtm); a.units += n(r.unitsTtm); a.buyers += n(r.buyersTtm);
    a.returns += n(r.returnsTtm); a.defect += n(r.defectReturnsTtm); a.tickets += n(r.ticketsLinkedTtm);
    m.set(k, a);
  }
  return [...m.values()];
}

export function SkuExplorer({ filters, line, sku, onLine, onSku, metrics, onOpenCustomer }: {
  filters: Filters; line: string | null; sku: string | null;
  onLine: (l: string | null) => void; onSku: (s: string | null) => void;
  metrics: MetricRow[] | undefined; onOpenCustomer: (id: string) => void;
}) {
  const perf = useQuery('sku-perf', fetchSkuPerformance);
  const lines = useMemo(() => [...new Set((perf.data ?? []).map((r) => r.productLine ?? ''))].filter(Boolean).sort(), [perf.data]);
  return (
    <Card title="SKU explorer" subtitle="Pick a product line (or click a bar in Product line penetration), then a SKU to see who buys it and what goes with it."
      action={(
        <div className="flex items-center gap-200">
        <LineageLink id="sku-chart" />
        <select value={line ?? ''} onChange={(e) => { onLine(e.target.value || null); onSku(null); }} aria-label="Product line"
          className="rounded-md border border-input bg-card px-300 py-100 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">All product lines</option>
          {lines.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        </div>
      )}>
      <Loaded q={perf} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
        {(rows) => {
          const skus = aggregate(rows, filters).filter((s) => !line || s.line === line);
          const selected = skus.find((s) => s.sku === sku);
          return (
            <div className="grid grid-cols-1 gap-400 xl:grid-cols-2">
              <SkuChart skus={skus} selected={sku} onSku={onSku} />
              {selected
                ? <SkuDetail s={selected} filters={filters} metrics={metrics} onClose={() => onSku(null)} onOpenCustomer={onOpenCustomer} onSku={onSku} />
                : <SkuTable skus={skus} onSku={onSku} />}
            </div>
          );
        }}
      </Loaded>
    </Card>
  );
}

function SkuChart({ skus, selected, onSku }: { skus: SkuAgg[]; selected: string | null; onSku: (s: string) => void }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const top = [...skus].sort((a, b) => b.sales - a.sales).slice(0, 15);
  const data: DataTable = {
    columns: [{ name: 'sku', displayName: 'SKU' }, { name: 'name', displayName: 'Product' }, { name: 'sales', displayName: 'Net sales (12 mo)', format: '$#,0' },
      { name: 'rate', displayName: 'Return rate', format: '0.0%' }, { name: 'tickets', displayName: 'Linked tickets', format: '#,0' },
      { name: 'sel', displayName: 'Selected' }],
    rows: top.map((s) => [s.sku, s.name, s.sales, s.sales ? s.returns / s.sales : 0, s.tickets, s.sku === selected ? 'yes' : 'no']),
  };
  const spec: VisualizationSpec = {
    mark: { type: 'bar', color: c.series1, cursor: 'pointer' },
    encoding: {
      y: { field: 'name', type: 'nominal', sort: '-x', title: null, axis: { labelLimit: 220 } },
      x: { field: 'sales', type: 'quantitative', title: 'Net sales, last 12 months' },
      opacity: { condition: { test: `datum.sel === 'yes' || ${selected ? 'false' : 'true'}`, value: 1 }, value: 0.35 },
      tooltip: [{ field: 'sku' }, { field: 'name' }, { field: 'sales' }, { field: 'rate' }, { field: 'tickets' }],
    },
  };
  const onInteraction = (events: InteractionEvent[]) => {
    for (const e of events) {
      if (e.action !== 'select') continue;
      const p = e.selections[0]?.predicates.find((x) => x.name === 'sku');
      if (p?.type === 'set' && typeof p.values[0] === 'string') onSku(p.values[0]);
    }
  };
  if (!top.length) return <Empty>No SKUs sold in this selection.</Empty>;
  return <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 12)' }} onInteraction={onInteraction} />;
}

function SkuTable({ skus, onSku }: { skus: SkuAgg[]; onSku: (s: string) => void }) {
  // SKUs that need attention: highest return rate or most linked tickets per buyer
  const flagged = [...skus].filter((s) => s.sales > 0)
    .sort((a, b) => (b.returns / b.sales + b.tickets / Math.max(1, b.buyers)) - (a.returns / a.sales + a.tickets / Math.max(1, a.buyers))).slice(0, 10);
  return (
    <div>
      <div className="mb-200 flex items-center justify-between gap-200">
        <h3 className="font-heading text-300 font-semibold uppercase tracking-wider">SKUs to watch</h3>
        <LineageLink id="sku-watch" />
      </div>
      <p className="mb-300 text-200 text-muted-foreground">Highest return rate and support tickets per buyer. Select one for detail.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-300">
          <thead>
            <tr className="border-b border-border text-left font-heading text-200 uppercase tracking-wider text-muted-foreground">
              <th className="px-200 py-200 font-semibold">SKU</th>
              <th className="px-200 py-200 text-right font-semibold">Sales</th>
              <th className="px-200 py-200 text-right font-semibold">YoY</th>
              <th className="px-200 py-200 text-right font-semibold">Return rate</th>
              <th className="px-200 py-200 text-right font-semibold">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map((s) => (
              <tr key={s.sku} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="px-200 py-200">
                  <button type="button" onClick={() => onSku(s.sku)} className="text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block font-[family-name:var(--font-monospace)] text-100 text-muted-foreground">{s.sku}</span>
                  </button>
                </td>
                <td className="px-200 py-200 text-right tabular-nums">{money(s.sales)}</td>
                <td className="px-200 py-200 text-right tabular-nums">{signedPct(s.prior ? s.sales / s.prior - 1 : NaN)}</td>
                <td className="px-200 py-200 text-right tabular-nums">{pct(s.returns / s.sales)}</td>
                <td className="px-200 py-200 text-right tabular-nums">{count(s.tickets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkuDetail({ s, filters, metrics, onClose, onOpenCustomer, onSku }: {
  s: SkuAgg; filters: Filters; metrics: MetricRow[] | undefined; onClose: () => void;
  onOpenCustomer: (id: string) => void; onSku: (s: string) => void;
}) {
  const buyers = useQuery(`sku-buyers:${s.sku}:${JSON.stringify(filters)}`, () => fetchSkuBuyers(s.sku, filters));
  const affinity = useQuery(`sku-aff:${s.sku}`, () => fetchSkuAffinity(s.sku));
  const risk = useMemo(() => new Map((metrics ?? []).map((m) => [m.unifiedCustomerId, m])), [metrics]);
  return (
    <div className="flex min-w-0 flex-col gap-300">
      <div className="flex items-start justify-between gap-300">
        <div>
          <h3 className="font-heading text-500 font-semibold">{s.name}</h3>
          <p className="font-[family-name:var(--font-monospace)] text-200 text-muted-foreground">{s.sku} · {s.line}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close SKU detail"
          className="rounded-md p-100 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="icon-size-200" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-300 md:grid-cols-4">
        <Kpi label="Net sales" value={money(s.sales)} detail={signedPct(s.prior ? s.sales / s.prior - 1 : NaN)} />
        <Kpi label="Buyers" value={count(s.buyers)} detail={`${count(s.units)} units`} />
        <Kpi label="Return rate" value={pct(s.sales ? s.returns / s.sales : NaN)} detail={`${pct(s.sales ? s.defect / s.sales : NaN)} defects`} />
        <Kpi label="Linked tickets" value={count(s.tickets)} detail="orders with a ticket" />
      </div>
      <div className="grid grid-cols-1 gap-300 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-200 flex items-center justify-between gap-200">
            <h4 className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Top buyers (12 mo)</h4>
            <LineageLink id="sku-buyers" compact />
          </div>
          <Loaded q={buyers} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*5)]" />}>
            {(rows) => {
              const top = [...rows].filter((r) => n(r.netSalesTtm) > 0).sort((a, b) => n(b.netSalesTtm) - n(a.netSalesTtm)).slice(0, 8);
              const lapsed = rows.filter((r) => n(r.netSalesTtm) === 0 && n(r.netSalesPriorTtm) > 0).length;
              if (!top.length) return <Empty>No buyers under these filters.</Empty>;
              return (
                <>
                  <ul className="divide-y divide-border">
                    {top.map((r) => {
                      const m = risk.get(r.unifiedCustomerId);
                      return (
                        <li key={r.unifiedCustomerId} className="flex items-center justify-between gap-200 py-100 text-300">
                          <button type="button" onClick={() => onOpenCustomer(r.unifiedCustomerId ?? '')}
                            className="min-w-0 truncate text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.customerName}</button>
                          <span className="flex shrink-0 items-center gap-200 tabular-nums">{money(r.netSalesTtm)}{m && <RiskBadge band={m.churnRiskBand} />}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {lapsed > 0 && <p className="mt-200 text-200 text-muted-foreground">{count(lapsed)} customers bought it last year but not this year.</p>}
                </>
              );
            }}
          </Loaded>
        </div>
        <div className="min-w-0">
          <div className="mb-200 flex items-center justify-between gap-200">
            <h4 className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Bought together</h4>
            <LineageLink id="sku-affinity" compact />
          </div>
          <Loaded q={affinity} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*5)]" />}>
            {(rows) => {
              const shown = rows.filter((r) => filters.customerType === 'all' || r.customerType === filters.customerType)
                .sort((a, b) => n(b.lift) * n(b.confidence) - n(a.lift) * n(a.confidence)).slice(0, 6);
              if (!shown.length) return <Empty>Not enough co-purchases to recommend.</Empty>;
              return (
                <ul className="divide-y divide-border">
                  {shown.map((r, i) => (
                    <li key={`${r.relatedSku}-${r.customerType}-${i}`} className="py-100 text-300">
                      <button type="button" onClick={() => onSku(r.relatedSku ?? '')}
                        className="text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.relatedProductName}</button>
                      <div className="text-200 text-muted-foreground">
                        {pct(r.confidence, 0)} of buyers also buy it · {n(r.lift).toFixed(1)}× lift{filters.customerType === 'all' ? ` · ${r.customerType}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              );
            }}
          </Loaded>
        </div>
      </div>
      <p className="text-200 text-muted-foreground">Last purchase dates and full buyer lists are in each customer's 360. Data as of {shortDate(new Date('2026-09-28'))}.</p>
    </div>
  );
}
