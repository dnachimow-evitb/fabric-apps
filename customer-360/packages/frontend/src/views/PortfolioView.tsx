import { useMemo } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable, InteractionEvent } from '@microsoft/fabric-visuals-core';

import { Card, Empty, Kpi, Loaded, Meter, RiskBadge, Skeleton } from '@/components/ui';
import { useQuery } from '@/hooks/use-query';
import { TYPE_DOMAIN, useChartColors } from '@/lib/chart-colors';
import {
  fetchMonthlyTrend, fetchPenetration, type Filters, type MetricRow, type PenetrationRow, type TrendRow,
} from '@/lib/c360';
import { count, money, pct, signedPct } from '@/lib/format';
import type { QueryState } from '@/hooks/use-query';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function PortfolioView({ filters, metrics, onOpenCustomer }: {
  filters: Filters; metrics: QueryState<MetricRow[]>; onOpenCustomer: (id: string) => void;
}) {
  const fkey = JSON.stringify(filters);
  const trend = useQuery(`trend:${fkey}`, () => fetchMonthlyTrend(filters));
  const penetration = useQuery('penetration', fetchPenetration);

  return (
    <div className="flex flex-col gap-400">
      <Loaded q={metrics} skeleton={<div className="grid grid-cols-2 gap-400 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[calc(var(--spacing-800)*3)]" />)}</div>}>
        {(rows) => <KpiStrip rows={rows} />}
      </Loaded>

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Churn risk × upsell opportunity"
          subtitle="Each dot is a customer, sized by trailing-12-month net sales. Click a dot to open the customer.">
          <Loaded q={metrics} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*11)]" />}>
            {(rows) => rows.length ? <Matrix rows={rows} onOpen={onOpenCustomer} /> : <Empty>No customers match these filters.</Empty>}
          </Loaded>
        </Card>
        <Card className="lg:col-span-5" title="SKU diversification" subtitle="Active customers by number of product lines bought in the last 12 months (of 9)">
          <Loaded q={metrics} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*11)]" />}>
            {(rows) => <Breadth rows={rows} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-7" title="Net sales and returns" subtitle="Monthly, last 24 months. Returns on their own scale below.">
          <Loaded q={trend} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => rows.length ? <Trend rows={rows} /> : <Empty>No sales in this period.</Empty>}
          </Loaded>
        </Card>
        <Card className="lg:col-span-5" title="Product line penetration" subtitle="Share of active customers who bought each line. Gaps are upsell whitespace.">
          <Loaded q={penetration} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => <Penetration rows={rows} filters={filters} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-12" title="Priority customers" subtitle="Ranked by revenue at risk plus upsell value. Select a customer for the full 360.">
          <Loaded q={metrics} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => <PriorityTable rows={rows} onOpen={onOpenCustomer} />}
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

function KpiStrip({ rows }: { rows: MetricRow[] }) {
  const sales = rows.reduce((s, r) => s + n(r.netSalesTtm), 0);
  const prior = rows.reduce((s, r) => s + n(r.netSalesPriorTtm), 0);
  const returns = rows.reduce((s, r) => s + n(r.returnsTtm), 0);
  const risk = rows.reduce((s, r) => s + n(r.revenueAtRisk), 0);
  const high = rows.filter((r) => r.churnRiskBand === 'High').length;
  const upsell = rows.reduce((s, r) => s + n(r.upsellValueEst), 0);
  const active = rows.filter((r) => n(r.ordersTtm) > 0);
  const lines = active.reduce((s, r) => s + n(r.productLinesTtm), 0) / (active.length || 1);
  const tickets = rows.reduce((s, r) => s + n(r.openTickets), 0);
  const yoy = prior > 0 ? sales / prior - 1 : NaN;
  return (
    <div className="grid grid-cols-2 gap-400 md:grid-cols-3 xl:grid-cols-6">
      <Kpi accent label="Net sales · last 12 months" value={money(sales)} detail={<span>{signedPct(yoy, 1)} vs. prior year</span>} />
      <Kpi label="Active customers" value={count(active.length)} detail={`${count(rows.length)} customers in view`} />
      <Kpi label="Return rate" value={pct(sales ? returns / sales : NaN)} detail={`${money(returns)} refunded`} />
      <Kpi label="Revenue at risk" value={money(risk)} detail={`${count(high)} high-risk customers`} />
      <Kpi label="Upsell opportunity" value={money(upsell)} detail="Est. annual, top 3 lines per customer" />
      <Kpi label="Product lines / customer" value={lines.toFixed(1)} detail={`${count(tickets)} open support tickets`} />
    </div>
  );
}

function Matrix({ rows, onOpen }: { rows: MetricRow[]; onOpen: (id: string) => void }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const data = useMemo<DataTable>(() => ({
    columns: [
      { name: 'id' }, { name: 'name', displayName: 'Customer' }, { name: 'type', displayName: 'Type' },
      { name: 'churn', displayName: 'Churn risk' }, { name: 'upsell', displayName: 'Upsell score' },
      { name: 'sales', displayName: 'Net sales (12 mo)', format: '$#,0' },
    ],
    rows: rows.map((r) => [r.unifiedCustomerId, r.customerName, r.customerType, r.churnRiskScore, r.upsellScore, n(r.netSalesTtm)]),
  }), [rows]);
  const spec = useMemo<VisualizationSpec>(() => ({
    layer: [
      {
        mark: { type: 'circle' },
        encoding: {
          x: { field: 'churn', type: 'quantitative', scale: { domain: [0, 100] }, title: 'Churn risk score' },
          y: { field: 'upsell', type: 'quantitative', scale: { domain: [0, 100] }, title: 'Upsell score' },
          size: { field: 'sales', type: 'quantitative', scale: { range: [12, 520] }, legend: null },
          color: { field: 'type', type: 'nominal', scale: { domain: [...TYPE_DOMAIN], range: [c.series1, c.series2] }, legend: { orient: 'top', title: null } },
          tooltip: [{ field: 'name' }, { field: 'type' }, { field: 'churn' }, { field: 'upsell' }, { field: 'sales' }],
        },
      },
      { mark: { type: 'rule', color: c.border }, encoding: { x: { datum: 50 } } },
      { mark: { type: 'rule', color: c.border }, encoding: { y: { datum: 50 } } },
      { mark: { type: 'text', align: 'right', dx: -6, dy: 12, color: c.muted }, encoding: { x: { datum: 100 }, y: { datum: 100 }, text: { value: 'PROTECT & EXPAND' } } },
      { mark: { type: 'text', align: 'left', dx: 6, dy: 12, color: c.muted }, encoding: { x: { datum: 0 }, y: { datum: 100 }, text: { value: 'GROW' } } },
      { mark: { type: 'text', align: 'right', dx: -6, dy: -8, color: c.muted }, encoding: { x: { datum: 100 }, y: { datum: 0 }, text: { value: 'SAVE' } } },
      { mark: { type: 'text', align: 'left', dx: 6, dy: -8, color: c.muted }, encoding: { x: { datum: 0 }, y: { datum: 0 }, text: { value: 'MAINTAIN' } } },
    ],
  }), [c]);
  const onInteraction = (events: InteractionEvent[]) => {
    for (const e of events) {
      if (e.action !== 'select') continue;
      const p = e.selections[0]?.predicates.find((x) => x.name === 'id');
      if (p?.type === 'set' && typeof p.values[0] === 'string') onOpen(p.values[0]);
    }
  };
  return <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 11)' }} onInteraction={onInteraction} />;
}

function Breadth({ rows }: { rows: MetricRow[] }) {
  const theme = useCssTheme();
  const active = rows.filter((r) => n(r.ordersTtm) > 0);
  const bins = Array.from({ length: 9 }, (_, i) => active.filter((r) => n(r.productLinesTtm) === i + 1).length);
  const avg = (pred: (r: MetricRow) => boolean) => {
    const s = active.filter(pred);
    return s.reduce((a, r) => a + n(r.netSalesTtm), 0) / (s.length || 1);
  };
  const narrow = bins[0] + bins[1];
  const data: DataTable = {
    columns: [{ name: 'lines', displayName: 'Product lines bought' }, { name: 'customers', displayName: 'Customers', format: '#,0' }],
    rows: bins.map((v, i) => [String(i + 1), v]),
  };
  const spec: VisualizationSpec = {
    layer: [
      { mark: { type: 'bar' } },
      { mark: { type: 'text', style: 'labelVertical' }, encoding: { text: { field: 'customers', type: 'quantitative' } } },
    ],
    encoding: {
      x: { field: 'lines', type: 'ordinal', sort: null, axis: { labelAngle: 0 } },
      y: { field: 'customers', type: 'quantitative' },
    },
  };
  return (
    <>
      <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 8)' }} />
      <p className="mt-300 text-200 text-muted-foreground">
        <strong className="text-foreground">{count(narrow)}</strong> active customers ({pct(narrow / (active.length || 1), 0)}) buy from only 1–2 lines.
        Customers with 4+ lines average <strong className="text-foreground">{money(avg((r) => n(r.productLinesTtm) >= 4))}</strong> vs.{' '}
        <strong className="text-foreground">{money(avg((r) => n(r.productLinesTtm) <= 2))}</strong> a year.
      </p>
    </>
  );
}

function Trend({ rows }: { rows: TrendRow[] }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const salesData: DataTable = {
    columns: [{ name: 'month', displayName: 'Month' }, { name: 'sales', displayName: 'Net sales', format: '$#,0' }],
    rows: rows.map((r) => [iso(r.month), r.netSales]),
  };
  const returnsData: DataTable = {
    columns: [{ name: 'month', displayName: 'Month' }, { name: 'returns', displayName: 'Returns', format: '$#,0' },
      { name: 'rate', displayName: 'Return rate', format: '0.0%' }],
    rows: rows.map((r) => [iso(r.month), r.returns, r.netSales ? r.returns / r.netSales : null]),
  };
  const salesSpec: VisualizationSpec = {
    mark: { type: 'line', color: c.series1, point: false },
    encoding: {
      x: { field: 'month', type: 'temporal', timeUnit: 'yearmonth', title: null },
      y: { field: 'sales', type: 'quantitative', title: 'Net sales' },
      tooltip: [{ field: 'month', type: 'temporal', timeUnit: 'yearmonth' }, { field: 'sales' }],
    },
  };
  const returnsSpec: VisualizationSpec = {
    mark: { type: 'bar', color: c.series2 },
    encoding: {
      x: { field: 'month', type: 'temporal', timeUnit: 'yearmonth', title: null },
      y: { field: 'returns', type: 'quantitative', title: 'Returns' },
      tooltip: [{ field: 'month', type: 'temporal', timeUnit: 'yearmonth' }, { field: 'returns' }, { field: 'rate' }],
    },
  };
  return (
    <div className="flex flex-col gap-200">
      <VegaVisual spec={salesSpec} data={salesData} theme={theme} style={{ height: 'calc(var(--spacing-800) * 6)' }} />
      <VegaVisual spec={returnsSpec} data={returnsData} theme={theme} style={{ height: 'calc(var(--spacing-800) * 4)' }} />
    </div>
  );
}

function Penetration({ rows, filters }: { rows: PenetrationRow[]; filters: Filters }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const shown = rows.filter((r) => filters.customerType === 'all' || r.customerType === filters.customerType);
  const data: DataTable = {
    columns: [{ name: 'line', displayName: 'Product line' }, { name: 'type', displayName: 'Type' },
      { name: 'penetration', displayName: 'Penetration', format: '0%' }],
    rows: shown.map((r) => [r.productLine, r.customerType, r.penetration]),
  };
  const spec: VisualizationSpec = {
    mark: { type: 'bar' },
    encoding: {
      y: { field: 'line', type: 'nominal', sort: { field: 'penetration', op: 'max', order: 'descending' }, title: null },
      x: { field: 'penetration', type: 'quantitative', scale: { domain: [0, 1] }, title: 'Share of active customers' },
      yOffset: { field: 'type', type: 'nominal', sort: [...TYPE_DOMAIN] },
      color: { field: 'type', type: 'nominal', scale: { domain: [...TYPE_DOMAIN], range: [c.series1, c.series2] }, legend: { orient: 'top', title: null } },
      tooltip: [{ field: 'line' }, { field: 'type' }, { field: 'penetration' }],
    },
  };
  return <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 10)' }} />;
}

function PriorityTable({ rows, onOpen }: { rows: MetricRow[]; onOpen: (id: string) => void }) {
  const top = [...rows].sort((a, b) => n(b.priorityScore) - n(a.priorityScore)).slice(0, 15);
  if (!top.length) return <Empty>No customers match these filters.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-300">
        <thead>
          <tr className="border-b border-border text-left font-heading text-200 uppercase tracking-wider text-muted-foreground">
            <th className="px-300 py-200 font-semibold">Customer</th>
            <th className="px-300 py-200 text-right font-semibold">Net sales (12 mo)</th>
            <th className="px-300 py-200 text-right font-semibold">Lines</th>
            <th className="px-300 py-200 text-right font-semibold">Return rate</th>
            <th className="px-300 py-200 text-right font-semibold">Open tickets</th>
            <th className="px-300 py-200 font-semibold">Churn risk</th>
            <th className="px-300 py-200 font-semibold">Upsell</th>
            <th className="px-300 py-200 font-semibold">Next best action</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r) => (
            <tr key={r.unifiedCustomerId} className="border-b border-border last:border-0 hover:bg-accent">
              <td className="px-300 py-300">
                <button type="button" onClick={() => onOpen(r.unifiedCustomerId ?? '')}
                  className="text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {r.customerName}
                </button>
                <div className="text-200 text-muted-foreground">
                  <span className="mr-100 inline-block size-200 rounded-full align-middle" aria-hidden
                    style={{ background: r.customerType === 'Wholesale' ? 'var(--color-series-1)' : 'var(--color-series-2)' }} />
                  {r.customerType} · {r.region}{r.accountManager ? ` · ${r.accountManager}` : ''}
                </div>
              </td>
              <td className="px-300 py-300 text-right tabular-nums">
                {money(r.netSalesTtm)}
                <div className="text-200 text-muted-foreground">{signedPct(r.salesYoy)}</div>
              </td>
              <td className="px-300 py-300 text-right tabular-nums">{count(r.productLinesTtm)}/9</td>
              <td className="px-300 py-300 text-right tabular-nums">{pct(r.returnRateTtm)}</td>
              <td className="px-300 py-300 text-right tabular-nums">
                {count(r.openTickets)}{n(r.highPriorityOpen) > 0 && <span className="text-200 text-[color:var(--color-status-critical)]"> ({count(r.highPriorityOpen)} high)</span>}
              </td>
              <td className="px-300 py-300"><RiskBadge band={r.churnRiskBand} score={r.churnRiskScore} />
                <div className="text-200 text-muted-foreground">{r.topChurnDriver ?? ''}</div></td>
              <td className="px-300 py-300"><Meter value={n(r.upsellScore)} label="Upsell score" />
                <div className="text-200 text-muted-foreground">{money(r.upsellValueEst)} est.</div></td>
              <td className="max-w-[calc(var(--spacing-800)*8)] px-300 py-300 text-200">{r.nextBestAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
