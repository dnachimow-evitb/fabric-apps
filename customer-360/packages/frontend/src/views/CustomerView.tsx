import { useMemo } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { AlertTriangle, CircleAlert, CircleCheck, Headset, Mail, Package, RotateCcw } from 'lucide-react';

import { Card, Empty, Loaded, RiskBadge, Skeleton } from '@/components/ui';
import { useQuery } from '@/hooks/use-query';
import { useChartColors } from '@/lib/chart-colors';
import {
  fetchCustomerCascade, fetchCustomerMonthly, fetchCustomerProductLines, fetchCustomerProfile, fetchCustomerSkuRecs, fetchCustomerSkus,
  fetchCustomerTimeline, fetchCustomerUpsell, parseDrivers, type CustomerMonthRow, type CustomerSkuRow, type SkuRecRow, type MetricRow, type ProductLineRow, type ProfileRow, type TimelineRow, type UpsellRow,
} from '@/lib/c360';
import { count, money, pct, shortDate, signedPct } from '@/lib/format';
import { cn } from '@/lib/utils';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function CustomerView({ id, metric }: { id: string; metric: MetricRow | undefined }) {
  const profile = useQuery(`profile:${id}`, () => fetchCustomerProfile(id));
  const monthly = useQuery(`monthly:${id}`, () => fetchCustomerMonthly(id));
  const lines = useQuery(`lines:${id}`, () => fetchCustomerProductLines(id));
  const upsell = useQuery(`upsell:${id}`, () => fetchCustomerUpsell(id));
  const timeline = useQuery(`timeline:${id}`, () => fetchCustomerTimeline(id));
  const skus = useQuery(`skus:${id}`, () => fetchCustomerSkus(id));
  const skuRecs = useQuery(`sku-recs:${id}`, () => fetchCustomerSkuRecs(id));
  const cascade = useQuery(`cascade:${id}`, () => fetchCustomerCascade(id));

  return (
    <div className="flex flex-col gap-400">
      <Loaded q={profile} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*4)]" />}>
        {(p) => (p ? <ProfileStrip p={p} m={metric} /> : <Card><Empty>This customer isn't in the unified customer table.</Empty></Card>)}
      </Loaded>

      {cascade.data && cascade.data.pattern !== 'Recovered' && (
        <div role="status" className="flex items-start gap-300 rounded-lg border border-[color:var(--color-status-critical)] bg-card p-400 text-300">
          <AlertTriangle aria-hidden className="mt-100 icon-size-300 shrink-0 text-[color:var(--color-status-critical)]" />
          <div>
            <strong className="font-semibold">Issue cascade: {cascade.data.pattern}.</strong>{' '}
            {count(cascade.data.ticketsInSpikeMonth)} support tickets in {shortDate(cascade.data.spikeMonth)}; marketing engagement went from{' '}
            {pct(cascade.data.engagementBefore, 0)} to {pct(cascade.data.engagementAfter, 0)} and monthly sales from{' '}
            {money(cascade.data.monthlySalesBefore)} to {money(cascade.data.monthlySalesAfter)}.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Sales" subtitle="Monthly net sales, this year vs. last year">
          <Loaded q={monthly} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => rows.length ? <SalesYoY rows={rows} /> : <Empty>No orders in the last 24 months.</Empty>}
          </Loaded>
        </Card>
        <Card className="lg:col-span-4" title="Churn risk drivers" subtitle="What moves this customer's score">
          {metric ? <Drivers m={metric} /> : <Empty>No purchase history to score.</Empty>}
        </Card>

        <Card className="lg:col-span-5" title="Product line mix & whitespace" subtitle="Share of last-12-month sales. Hatched lines are not yet bought.">
          <Loaded q={lines} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => <Mix rows={rows} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-4" title="Upsell opportunities" subtitle="Based on what similar customers buy">
          <Loaded q={upsell} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => <Upsell rows={rows} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-3" title="Returns" subtitle="Last 12 months">
          <Loaded q={monthly} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => <Returns rows={rows} m={metric} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-7" title="SKUs bought" subtitle="Last 12 months vs. prior year. Lapsed SKUs were bought last year but not this year.">
          <Loaded q={skus} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*7)]" />}>
            {(rows) => <SkuList rows={rows} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-5" title="Recommended SKUs" subtitle="From what customers with a similar basket buy">
          <Loaded q={skuRecs} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*7)]" />}>
            {(rows) => <SkuRecs rows={rows} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-6" title="Marketing activity" subtitle="Klaviyo campaign touches and engagement, last 12 months">
          <Loaded q={monthly} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*7)]" />}>
            {(rows) => <Marketing rows={rows} m={metric} p={profile.data ?? null} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-6" title="Support" subtitle="Zendesk tickets">
          <Loaded q={timeline} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*7)]" />}>
            {(rows) => <Support rows={rows} m={metric} />}
          </Loaded>
        </Card>

        <Card className="lg:col-span-12" title="Activity timeline" subtitle="Orders, returns, marketing and support in one feed">
          <Loaded q={timeline} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => <Timeline rows={rows} />}
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-border p-400 lg:border-r lg:last:border-r-0">
      <div className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-100">{children}</div>
    </div>
  );
}

const SOURCES = [['inErp', 'ERP'], ['inShopify', 'Shopify'], ['inKlaviyo', 'Klaviyo'], ['inZendesk', 'Zendesk']] as const;

function ProfileStrip({ p, m }: { p: ProfileRow; m: MetricRow | undefined }) {
  return (
    <section className="grid grid-cols-1 rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr]">
      <Field label={p.customerType === 'Wholesale' ? 'Wholesale account' : p.customerType === 'Direct' ? 'Direct customer' : p.customerType ?? 'Customer'}>
        <h2 className="font-heading text-600 font-semibold leading-600">{p.customerName}</h2>
        <p className="text-200 text-muted-foreground">
          {[p.city && `${p.city}, ${p.state}`, p.accountManager && `Owner: ${p.accountManager}`, p.customerSince && `Customer since ${new Date(String(p.customerSince)).getFullYear()}`,
            p.locationCount ? `${p.locationCount} location${n(p.locationCount) > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-100 text-200"><span className="rounded-sm bg-muted px-100 font-semibold">{p.lifecycleStage}</span>{' '}
          <span className="text-muted-foreground">{p.activeChannels12m ?? 'No active channels'}</span></p>
      </Field>
      <Field label="Net sales · 12 months">
        <div className="font-[family-name:var(--font-numeric)] text-hero-700 font-semibold leading-hero-700">{money(m?.netSalesTtm)}</div>
        <div className="text-200 text-muted-foreground">{signedPct(m?.salesYoy, 1)} vs. prior year · {count(p.lifetimeOrders)} orders</div>
      </Field>
      <Field label="Churn risk">
        <div className="font-[family-name:var(--font-numeric)] text-hero-700 font-semibold leading-hero-700">{m?.churnRiskScore ?? '—'}</div>
        <RiskBadge band={m?.churnRiskBand} />
      </Field>
      <Field label="Upsell score">
        <div className="font-[family-name:var(--font-numeric)] text-hero-700 font-semibold leading-hero-700">{m?.upsellScore ?? '—'}</div>
        <div className="text-200 text-muted-foreground">{money(m?.upsellValueEst)} est. a year</div>
      </Field>
      <Field label="Unified identity">
        <div className="flex flex-wrap gap-100">
          {SOURCES.map(([k, label]) => (
            <span key={k} className={cn('rounded-sm border px-100 text-200', p[k] ? 'border-foreground/40 font-semibold' : 'border-border text-muted-foreground line-through')}>{label}</span>
          ))}
        </div>
        <div className="mt-100 text-200 text-muted-foreground">
          {count(p.linkedSourceRecords)} source records · match confidence {pct(p.identityConfidence, 0)}
        </div>
        <div className="font-[family-name:var(--font-monospace)] text-100 text-muted-foreground">{p.unifiedCustomerId}</div>
      </Field>
    </section>
  );
}

function SalesYoY({ rows }: { rows: CustomerMonthRow[] }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const data = useMemo<DataTable>(() => {
    const last = rows[rows.length - 1]?.month ?? new Date();
    const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1);
    const monthsBack = (d: Date) => Math.round((end - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) / (30.44 * 864e5));
    const out: unknown[][] = [];
    for (const r of rows) {
      const back = monthsBack(r.month);
      if (back < 0 || back > 23) continue;
      const label = r.month.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      out.push([11 - (back % 12), label, back < 12 ? 'This year' : 'Last year', n(r.netSales)]);
    }
    return {
      columns: [{ name: 'idx' }, { name: 'month', displayName: 'Month' }, { name: 'period', displayName: 'Period' },
        { name: 'sales', displayName: 'Net sales', format: '$#,0' }],
      rows: out,
    };
  }, [rows]);
  // x-axis runs oldest -> latest month of the trailing year; both periods share the same month labels
  const order = useMemo(() => {
    const labels = Array<string>(12).fill('');
    for (const r of data.rows) labels[r[0] as number] = r[1] as string;
    return labels.filter(Boolean);
  }, [data]);
  const spec: VisualizationSpec = {
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'month', type: 'ordinal', sort: order, title: null, axis: { labelAngle: 0 } },
      y: { field: 'sales', type: 'quantitative', title: 'Net sales' },
      color: { field: 'period', type: 'nominal', scale: { domain: ['This year', 'Last year'], range: [c.series1, c.series2] }, legend: { orient: 'top', title: null } },
      tooltip: [{ field: 'month' }, { field: 'period' }, { field: 'sales' }],
    },
  };
  return <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 8)' }} />;
}

function Drivers({ m }: { m: MetricRow }) {
  const drivers = parseDrivers(m.churnDrivers);
  if (!drivers.length) return <Empty>No risk drivers. This customer looks healthy.</Empty>;
  return (
    <ul className="flex flex-col gap-300">
      {drivers.map((d) => {
        const Icon = d.points >= 15 ? AlertTriangle : d.points >= 6 ? CircleAlert : CircleCheck;
        const tone = d.points >= 15 ? 'text-[color:var(--color-status-critical)]' : d.points >= 6 ? 'text-[color:var(--color-status-warning)]' : 'text-muted-foreground';
        return (
          <li key={d.driver} className="grid grid-cols-[auto_1fr_auto] items-start gap-200">
            <Icon aria-hidden className={cn('mt-100 icon-size-200', tone)} />
            <div>
              <div className="text-300 font-semibold">{d.driver}</div>
              <div className="text-200 text-muted-foreground">{d.detail}</div>
            </div>
            <span className="whitespace-nowrap text-200 tabular-nums text-muted-foreground">+{Math.round(d.points)} pts</span>
          </li>
        );
      })}
      <li className="text-200 text-muted-foreground">Rules-based score (0–100). Replace with a trained model once real history is connected.</li>
    </ul>
  );
}

function Mix({ rows }: { rows: ProductLineRow[] }) {
  const sorted = [...rows].sort((a, b) => n(b.shareOfSalesTtm) - n(a.shareOfSalesTtm) || n(b.peerPenetration) - n(a.peerPenetration));
  if (!sorted.length) return <Empty>No product line data.</Empty>;
  return (
    <ul className="flex flex-col gap-200">
      {sorted.map((r) => r.purchasedTtm ? (
        <li key={r.productLine} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-300 text-300">
          <span className="truncate">{r.productLine}</span>
          <span className="h-200 rounded-r-sm bg-muted"><span className="block h-full rounded-r-sm bg-[color:var(--color-series-1)]" style={{ width: `${n(r.shareOfSalesTtm) * 100}%` }} /></span>
          <span className="text-right tabular-nums">{pct(r.shareOfSalesTtm, 0)}</span>
        </li>
      ) : (
        <li key={r.productLine} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-300 text-300">
          <span className="truncate font-semibold">{r.productLine}</span>
          <span className="h-200 rounded-r-sm border border-dashed border-border bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_8px)]"
            title={`Not bought in 12 months. ${pct(r.peerPenetration, 0)} of similar customers buy it.`} />
          <span className="text-right text-200 text-muted-foreground">{pct(r.peerPenetration, 0)} peers</span>
        </li>
      ))}
    </ul>
  );
}

function Upsell({ rows }: { rows: UpsellRow[] }) {
  if (!rows.length) return <Empty>Buys every product line. Focus on retention and new launches.</Empty>;
  return (
    <div className="flex flex-col gap-300">
      {rows.map((r) => (
        <article key={r.productLine} className="rounded-md border border-border border-l-4 border-l-primary p-300">
          <div className="text-300 font-semibold">Add {r.productLine}</div>
          <div className="text-200 text-muted-foreground">{r.reason}</div>
          <div className="mt-100 text-200 font-semibold">{money(r.estimatedAnnualValue)} est. a year</div>
        </article>
      ))}
    </div>
  );
}

function Returns({ rows, m }: { rows: CustomerMonthRow[]; m: MetricRow | undefined }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const recent = rows.slice(-12);
  const data: DataTable = {
    columns: [{ name: 'month', displayName: 'Month' }, { name: 'returns', displayName: 'Returns', format: '$#,0' }],
    rows: recent.map((r) => [r.month.toISOString().slice(0, 10), n(r.returnsAmount)]),
  };
  const spec: VisualizationSpec = {
    mark: { type: 'bar', color: c.series2 },
    encoding: {
      x: { field: 'month', type: 'temporal', timeUnit: 'yearmonth', title: null, axis: { format: '%b' } },
      y: { field: 'returns', type: 'quantitative', title: null },
      tooltip: [{ field: 'month', type: 'temporal', timeUnit: 'yearmonth' }, { field: 'returns' }],
    },
  };
  return (
    <>
      <div className="mb-300 grid grid-cols-2 gap-300">
        <Stat label="Return rate" value={pct(m?.returnRateTtm)} tone={n(m?.returnRateTtm) > 0.08 ? 'bad' : undefined} />
        <Stat label="Refunded" value={money(m?.returnsTtm)} />
      </div>
      <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 5)' }} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div>
      <div className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('font-[family-name:var(--font-numeric)] text-500 font-semibold', tone === 'bad' && 'text-[color:var(--color-status-critical)]')}>{value}</div>
    </div>
  );
}

function Marketing({ rows, m, p }: { rows: CustomerMonthRow[]; m: MetricRow | undefined; p: ProfileRow | null }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const recent = rows.slice(-12);
  const data: DataTable = {
    columns: [{ name: 'month', displayName: 'Month' }, { name: 'engaged', displayName: 'Engaged', format: '#,0' },
      { name: 'touches', displayName: 'Touches', format: '#,0' }],
    rows: recent.map((r) => [r.month.toISOString().slice(0, 10), n(r.marketingEngagements), n(r.marketingTouches)]),
  };
  const spec: VisualizationSpec = {
    mark: { type: 'bar', color: c.series1 },
    encoding: {
      x: { field: 'month', type: 'temporal', timeUnit: 'yearmonth', title: null, axis: { format: '%b' } },
      y: { field: 'engaged', type: 'quantitative', title: 'Opens & clicks' },
      tooltip: [{ field: 'month', type: 'temporal', timeUnit: 'yearmonth' }, { field: 'engaged' }, { field: 'touches' }],
    },
  };
  return (
    <>
      <div className="mb-300 grid grid-cols-3 gap-300">
        <Stat label="Engagement · 90 days" value={pct(m?.engagementRate90d, 0)} />
        <Stat label="Last engaged" value={m?.daysSinceEngaged != null ? `${m.daysSinceEngaged}d ago` : '—'} tone={n(m?.daysSinceEngaged) > 90 ? 'bad' : undefined} />
        <Stat label="Consent" value={[p?.emailMarketingConsent && 'Email', p?.smsMarketingConsent && 'SMS'].filter(Boolean).join(' + ') || 'None'} />
      </div>
      <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 5)' }} />
    </>
  );
}

function Support({ rows, m }: { rows: TimelineRow[]; m: MetricRow | undefined }) {
  const tickets = rows.filter((r) => r.source === 'Support').slice(0, 6);
  const hours = m?.avgResolutionMinutes12m != null ? (n(m.avgResolutionMinutes12m) / 60).toFixed(0) : null;
  return (
    <>
      <div className="mb-300 grid grid-cols-3 gap-300">
        <Stat label="Open" value={count(m?.openTickets)} tone={n(m?.highPriorityOpen) > 0 ? 'bad' : undefined} />
        <Stat label="Avg. resolution" value={hours ? `${hours}h` : '—'} />
        <Stat label="Bad CSAT · 12 mo" value={count(m?.badCsat12m)} tone={n(m?.badCsat12m) > 0 ? 'bad' : undefined} />
      </div>
      {tickets.length ? (
        <ul className="divide-y divide-border">
          {tickets.map((t, i) => (
            <li key={i} className="flex items-baseline justify-between gap-300 py-200 text-300">
              <span className="min-w-0 truncate">{t.title}</span>
              <span className="whitespace-nowrap text-200 text-muted-foreground">{t.detail} · {shortDate(t.eventAt)}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>No recent tickets.</Empty>}
    </>
  );
}

const ICON = { Order: Package, Return: RotateCcw, Marketing: Mail, Support: Headset } as const;

function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (!rows.length) return <Empty>No activity yet.</Empty>;
  return (
    <ol className="grid grid-cols-1 gap-x-600 md:grid-cols-2">
      {rows.slice(0, 16).map((r, i) => {
        const Icon = ICON[r.source as keyof typeof ICON] ?? Package;
        return (
          <li key={i} className="grid grid-cols-[6.5rem_auto_1fr] items-start gap-300 border-b border-border py-200 text-300">
            <span className="tabular-nums text-200 text-muted-foreground">{shortDate(r.eventAt)}</span>
            <Icon aria-label={r.source ?? ''} className="mt-100 icon-size-200 text-muted-foreground" />
            <span className="min-w-0"><span className="block truncate">{r.title}</span>
              <span className="block truncate text-200 text-muted-foreground">{r.source} · {r.detail}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

function SkuList({ rows }: { rows: CustomerSkuRow[] }) {
  const active = [...rows].filter((r) => n(r.netSalesTtm) > 0).sort((a, b) => n(b.netSalesTtm) - n(a.netSalesTtm));
  const lapsed = rows.filter((r) => n(r.netSalesTtm) === 0 && n(r.netSalesPriorTtm) > 0).sort((a, b) => n(b.netSalesPriorTtm) - n(a.netSalesPriorTtm));
  if (!rows.length) return <Empty>No SKU purchases in the last 24 months.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-300">
        <thead>
          <tr className="border-b border-border text-left font-heading text-200 uppercase tracking-wider text-muted-foreground">
            <th className="px-200 py-200 font-semibold">SKU</th>
            <th className="px-200 py-200 text-right font-semibold">12 mo</th>
            <th className="px-200 py-200 text-right font-semibold">Prior yr</th>
            <th className="px-200 py-200 text-right font-semibold">Units</th>
            <th className="px-200 py-200 text-right font-semibold">Returned</th>
          </tr>
        </thead>
        <tbody>
          {[...active.slice(0, 8), ...lapsed.slice(0, 4)].map((r) => {
            const isLapsed = n(r.netSalesTtm) === 0;
            return (
              <tr key={r.sku} className="border-b border-border last:border-0">
                <td className="px-200 py-200">
                  <span className="block truncate font-semibold">{r.productName}</span>
                  <span className="block text-200 text-muted-foreground">
                    {r.productLine}{isLapsed && <span className="ml-100 font-semibold text-[color:var(--color-status-critical)]">· Lapsed</span>}
                  </span>
                </td>
                <td className="px-200 py-200 text-right tabular-nums">{money(r.netSalesTtm)}</td>
                <td className="px-200 py-200 text-right tabular-nums text-muted-foreground">{money(r.netSalesPriorTtm)}</td>
                <td className="px-200 py-200 text-right tabular-nums">{count(r.unitsTtm)}</td>
                <td className="px-200 py-200 text-right tabular-nums">{n(r.returnsTtm) > 0 ? money(r.returnsTtm) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkuRecs({ rows }: { rows: SkuRecRow[] }) {
  if (!rows.length) return <Empty>Not enough basket data to recommend SKUs.</Empty>;
  return (
    <ul className="flex flex-col gap-200">
      {rows.map((r) => (
        <li key={r.sku} className="rounded-md border border-border border-l-4 border-l-primary p-300">
          <div className="text-300 font-semibold">{r.productName}</div>
          <div className="text-200 text-muted-foreground">{r.productLine} · {r.reason}</div>
          <div className="mt-100 text-200 font-semibold">{money(r.estimatedAnnualValue)} est. a year</div>
        </li>
      ))}
    </ul>
  );
}
