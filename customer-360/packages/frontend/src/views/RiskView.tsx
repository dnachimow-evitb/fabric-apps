import { useMemo, useState } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';

import { Card, Empty, Loaded, Skeleton } from '@/components/ui';
import { useQuery } from '@/hooks/use-query';
import { useChartColors } from '@/lib/chart-colors';
import {
  fetchCustomerCascades, fetchDriverCorrelation, fetchIssueCascade, fetchRiskConcentration,
  type CascadeRow, type ConcentrationRow, type CustomerCascadeRow, type CustomerType, type DriverCorrRow, type Filters,
} from '@/lib/c360';
import { count, money, pct, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const PATTERNS = ['Ticket → disengage → sales decline', 'Ticket → sales decline', 'Ticket → disengage', 'Recovered'] as const;

export function RiskView({ filters, onOpenCustomer }: { filters: Filters; onOpenCustomer: (id: string) => void }) {
  // The event study and correlations are per customer type; default to Direct when the page shows all.
  const [typeChoice, setTypeChoice] = useState<CustomerType>('Direct');
  const type: CustomerType = filters.customerType === 'all' ? typeChoice : filters.customerType;
  const cascade = useQuery('cascade', fetchIssueCascade);
  const customers = useQuery(`cascades:${JSON.stringify(filters)}`, () => fetchCustomerCascades(filters));
  const drivers = useQuery('drivers', fetchDriverCorrelation);
  const concentration = useQuery('concentration', fetchRiskConcentration);

  return (
    <div className="flex flex-col gap-400">
      {filters.customerType === 'all' && (
        <div className="flex items-center gap-200" role="group" aria-label="Customer type for the analysis">
          <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Analyse</span>
          {(['Direct', 'Wholesale'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTypeChoice(t)} aria-pressed={typeChoice === t}
              className={cn('rounded-md border px-300 py-100 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                typeChoice === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
              {t === 'Direct' ? 'Direct (B2C)' : 'Wholesale (B2B)'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Issue cascade: support spike → marketing → sales"
          subtitle="Customers with a support spike (2+ tickets in a month, or a high-priority ticket) vs. customers without one, aligned on the same calendar months. Month 0 is the spike.">
          <Loaded q={cascade} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => <EventStudy rows={rows.filter((r) => r.customerType === type)} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-4" title="What happens after a spike" subtitle="Share of spiking customers by pattern (first 9 months)">
          <Loaded q={customers} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => <Patterns rows={rows.filter((r) => r.customerType === type)} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-6" title="Which signals predict next-6-month sales?"
          subtitle="Correlation between each driver (measured 6 months ago) and the sales change since. Left = predicts decline.">
          <Loaded q={drivers} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*9)]" />}>
            {(rows) => <Drivers rows={rows.filter((r) => r.customerType === type)} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-6" title="Where revenue at risk sits" subtitle="Revenue at risk (sales × churn risk) by dimension">
          <Loaded q={concentration} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*9)]" />}>
            {(rows) => <Concentration rows={rows} filters={filters} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-12" title="Customers in a full cascade"
          subtitle="Support spike, then disengagement, then a sales decline. Largest monthly sales drop first. Select a customer for the 360.">
          <Loaded q={customers} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => <CascadeList rows={rows.filter((r) => r.pattern === PATTERNS[0])} onOpen={onOpenCustomer} />}
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

function EventStudy({ rows }: { rows: CascadeRow[] }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const data = useMemo<DataTable>(() => ({
    columns: [{ name: 'month', displayName: 'Months from spike' }, { name: 'cohort', displayName: 'Cohort' },
      { name: 'sales', displayName: 'Sales vs. baseline', format: '0%' }, { name: 'engagement', displayName: 'Engagement rate', format: '0.0%' },
      { name: 'customers', displayName: 'Customers', format: '#,0' }],
    rows: rows.map((r) => [n(r.relMonth), r.cohort, n(r.salesIndex), n(r.engagementRate), n(r.customers)]),
  }), [rows]);
  if (!rows.length) return <Empty>Not enough support spikes for this customer type.</Empty>;
  const color = { field: 'cohort', type: 'nominal' as const, scale: { domain: ['Support spike', 'No spike'], range: [c.series2, c.series1] },
    legend: { orient: 'top' as const, title: null } };
  const base = (field: string, title: string): VisualizationSpec => ({
    layer: [
      { mark: { type: 'rule', color: c.border }, encoding: { x: { datum: 0 } } },
      {
        mark: { type: 'line', point: true },
        encoding: {
          x: { field: 'month', type: 'quantitative', title: 'Months from spike', scale: { domain: [-6, 9] } },
          y: { field, type: 'quantitative', title },
          color,
          tooltip: [{ field: 'cohort' }, { field: 'month' }, { field }, { field: 'customers' }],
        },
      },
    ],
  });
  return (
    <div className="grid grid-cols-1 gap-300 md:grid-cols-2">
      <VegaVisual spec={base('engagement', 'Marketing engagement rate')} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 8)' }} />
      <VegaVisual spec={base('sales', 'Sales vs. pre-spike baseline')} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 8)' }} />
    </div>
  );
}

function Patterns({ rows }: { rows: CustomerCascadeRow[] }) {
  if (!rows.length) return <Empty>No support spikes in view.</Empty>;
  const lagEng = rows.filter((r) => r.engagementDropLag != null);
  const lagSales = rows.filter((r) => r.salesDropLag != null);
  const avg = (xs: CustomerCascadeRow[], k: 'engagementDropLag' | 'salesDropLag') => xs.reduce((s, r) => s + n(r[k]), 0) / (xs.length || 1);
  return (
    <div className="flex flex-col gap-300">
      <ul className="flex flex-col gap-200">
        {PATTERNS.map((p, i) => {
          const k = rows.filter((r) => r.pattern === p).length;
          return (
            <li key={p} className="grid grid-cols-[1fr_auto] items-center gap-200 text-300">
              <span className={cn(i === 0 && 'font-semibold')}>{p}</span>
              <span className="tabular-nums">{pct(k / rows.length, 0)} <span className="text-200 text-muted-foreground">({count(k)})</span></span>
              <span className="col-span-2 h-100 rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${(k / rows.length) * 100}%`,
                  background: i === 3 ? 'var(--color-status-good)' : i === 0 ? 'var(--color-status-critical)' : 'var(--color-status-warning)' }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-200 text-muted-foreground">
        After a spike, engagement drops in <strong className="text-foreground">{avg(lagEng, 'engagementDropLag').toFixed(1)} months</strong> on
        average and sales in <strong className="text-foreground">{avg(lagSales, 'salesDropLag').toFixed(1)} months</strong>, a window to intervene.
      </p>
    </div>
  );
}

function Drivers({ rows }: { rows: DriverCorrRow[] }) {
  const theme = useCssTheme();
  const c = useChartColors();
  if (!rows.length) return <Empty>No driver analysis for this customer type.</Empty>;
  const data: DataTable = {
    columns: [{ name: 'driver', displayName: 'Driver' }, { name: 'corr', displayName: 'Correlation', format: '0.00' },
      { name: 'high', displayName: 'Sales change when high', format: '0%' }, { name: 'other', displayName: 'Sales change otherwise', format: '0%' },
      { name: 'def', displayName: '"High" means' }, { name: 'direction', displayName: 'Direction' }],
    rows: rows.map((r) => [r.driver, n(r.correlation), n(r.salesChangeWhenHigh), n(r.salesChangeOtherwise), r.highDefinition,
      n(r.correlation) < 0 ? 'Predicts decline' : 'Predicts growth']),
  };
  const spec: VisualizationSpec = {
    layer: [
      {
        mark: { type: 'bar' },
        encoding: {
          y: { field: 'driver', type: 'nominal', sort: { field: 'corr', order: 'ascending' }, title: null },
          x: { field: 'corr', type: 'quantitative', scale: { domain: [-0.6, 0.6] }, title: 'Correlation with next-6-month sales change' },
          color: { field: 'direction', type: 'nominal', scale: { domain: ['Predicts decline', 'Predicts growth'], range: [c.series2, c.series1] },
            legend: { orient: 'top', title: null } },
          tooltip: [{ field: 'driver' }, { field: 'corr' }, { field: 'high' }, { field: 'other' }, { field: 'def' }],
        },
      },
      { mark: { type: 'rule', color: c.muted }, encoding: { x: { datum: 0 } } },
    ],
  };
  return <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 8)' }} />;
}

const DIMENSIONS = ['Region', 'Account owner', 'Product line', 'Risk band'] as const;

function Concentration({ rows, filters }: { rows: ConcentrationRow[]; filters: Filters }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const [dim, setDim] = useState<(typeof DIMENSIONS)[number]>('Product line');
  const shown = rows.filter((r) => r.dimension === dim && (filters.customerType === 'all' || r.customerType === filters.customerType));
  const data: DataTable = {
    columns: [{ name: 'value', displayName: dim }, { name: 'type', displayName: 'Type' },
      { name: 'risk', displayName: 'Revenue at risk', format: '$#,0' }, { name: 'high', displayName: 'High-risk customers', format: '#,0' },
      { name: 'sales', displayName: 'Net sales (12 mo)', format: '$#,0' }],
    rows: shown.map((r) => [r.value, r.customerType, n(r.revenueAtRisk), n(r.highRiskCustomers), n(r.netSalesTtm)]),
  };
  const spec: VisualizationSpec = {
    mark: { type: 'bar' },
    encoding: {
      y: { field: 'value', type: 'nominal', sort: '-x', title: null },
      x: { field: 'risk', type: 'quantitative', stack: 'zero', title: 'Revenue at risk' },
      color: { field: 'type', type: 'nominal', scale: { domain: ['Wholesale', 'Direct'], range: [c.series1, c.series2] }, legend: { orient: 'top', title: null } },
      tooltip: [{ field: 'value' }, { field: 'type' }, { field: 'risk' }, { field: 'high' }, { field: 'sales' }],
    },
  };
  return (
    <>
      <div className="mb-300 flex flex-wrap gap-100" role="group" aria-label="Dimension">
        {DIMENSIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDim(d)} aria-pressed={dim === d}
            className={cn('rounded-md border px-200 py-100 text-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              dim === d ? 'border-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground')}>{d}</button>
        ))}
      </div>
      {shown.length ? <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 7)' }} />
        : <Empty>No revenue at risk in view.</Empty>}
    </>
  );
}

function CascadeList({ rows, onOpen }: { rows: CustomerCascadeRow[]; onOpen: (id: string) => void }) {
  const top = [...rows].sort((a, b) => (n(b.monthlySalesBefore) - n(b.monthlySalesAfter)) - (n(a.monthlySalesBefore) - n(a.monthlySalesAfter))).slice(0, 12);
  if (!top.length) return <Empty>No customers in a full cascade under these filters.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-300">
        <thead>
          <tr className="border-b border-border text-left font-heading text-200 uppercase tracking-wider text-muted-foreground">
            <th className="px-300 py-200 font-semibold">Customer</th>
            <th className="px-300 py-200 font-semibold">Spike</th>
            <th className="px-300 py-200 text-right font-semibold">Engagement before → after</th>
            <th className="px-300 py-200 text-right font-semibold">Monthly sales before → after</th>
            <th className="px-300 py-200 text-right font-semibold">Months to disengage / decline</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r) => (
            <tr key={r.unifiedCustomerId} className="border-b border-border last:border-0 hover:bg-accent">
              <td className="px-300 py-300">
                <button type="button" onClick={() => onOpen(r.unifiedCustomerId ?? '')}
                  className="text-left font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.customerName}</button>
                <div className="text-200 text-muted-foreground">{r.customerType} · {r.region}{r.accountManager ? ` · ${r.accountManager}` : ''}</div>
              </td>
              <td className="px-300 py-300">{shortDate(r.spikeMonth)}<div className="text-200 text-muted-foreground">{count(r.ticketsInSpikeMonth)} tickets</div></td>
              <td className="px-300 py-300 text-right tabular-nums">{pct(r.engagementBefore, 0)} → {pct(r.engagementAfter, 0)}</td>
              <td className="px-300 py-300 text-right tabular-nums">{money(r.monthlySalesBefore)} → {money(r.monthlySalesAfter)}</td>
              <td className="px-300 py-300 text-right tabular-nums">{r.engagementDropLag ?? '—'} / {r.salesDropLag ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
