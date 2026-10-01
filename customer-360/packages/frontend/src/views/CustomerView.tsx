import { useMemo, useState } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { AlertTriangle, Check, CircleAlert, CircleCheck, GitMerge, Headset, Mail, Package, RotateCcw, X } from 'lucide-react';

import { Card, Empty, Loaded, RiskBadge, Skeleton } from '@/components/ui';
import { Combobox, type ComboOption } from '@/components/Combobox';
import { CustomerJourney } from '@/components/CustomerJourney';
import { useAuth } from '@/hooks/auth.context';
import { useQuery, type QueryState } from '@/hooks/use-query';
import { useChartColors } from '@/lib/chart-colors';
import {
  fetchCustomerCascade, fetchCustomerMonthly, fetchMergeCandidates, proposeMerge, type MergeCandidateRow, fetchCustomerProductLines, fetchCustomerProfile, fetchCustomerSkuRecs, fetchCustomerSkus,
  fetchCustomerTimeline, fetchCustomerUpsell, parseDrivers, type CustomerMonthRow, type CustomerSkuRow, type SkuRecRow, type MetricRow, type ProductLineRow, type ProfileRow, type TimelineRow, type UpsellRow,
} from '@/lib/c360';
import { count, money, pct, shortDate, signedPct } from '@/lib/format';
import {
  mergeMetrics, mergeMonthly, mergeProductLines, mergeProfiles, mergeSkuRecs, mergeSkus, mergeTimeline, mergeUpsell,
} from '@/lib/merge-emulation';
import { cn } from '@/lib/utils';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function CustomerView({ id, metric, all }: { id: string; metric: MetricRow | undefined; all: MetricRow[] }) {
  // Merge emulation: extra unified customers previewed as one identity with this one (nothing is saved).
  const [extra, setExtra] = useState<string[]>([]);
  const ids = [id, ...extra];
  const k = ids.join(',');
  const each = <T,>(f: (x: string) => Promise<T>) => () => Promise.all(ids.map(f));
  const profiles = useQuery(`profile:${k}`, each(fetchCustomerProfile));
  const monthlyAll = useQuery(`monthly:${k}`, each(fetchCustomerMonthly));
  const linesAll = useQuery(`lines:${k}`, each(fetchCustomerProductLines));
  const upsellAll = useQuery(`upsell:${k}`, each(fetchCustomerUpsell));
  const timelineAll = useQuery(`timeline:${k}`, each(fetchCustomerTimeline));
  const skusAll = useQuery(`skus:${k}`, each(fetchCustomerSkus));
  const skuRecsAll = useQuery(`sku-recs:${k}`, each(fetchCustomerSkuRecs));
  const cascade = useQuery(`cascade:${id}`, () => fetchCustomerCascade(id));

  const merging = extra.length > 0;
  const profile = useMapped(profiles, combine(mergeProfiles));
  const monthly = useMapped(monthlyAll, combine(mergeMonthly));
  const lines = useMapped(linesAll, combine(mergeProductLines));
  const timeline = useMapped(timelineAll, combine(mergeTimeline));
  const skus = useMapped(skusAll, combine(mergeSkus));
  // recommendations drop what the combined customer already buys
  const upsellData = useMemo(() => (upsellAll.data && lines.data
    ? (upsellAll.data.length === 1 ? upsellAll.data[0] : mergeUpsell(upsellAll.data, lines.data)) : undefined), [upsellAll.data, lines.data]);
  const upsell = { ...upsellAll, data: upsellData } as QueryState<UpsellRow[]>;
  const skuRecsData = useMemo(() => (skuRecsAll.data && skus.data
    ? (skuRecsAll.data.length === 1 ? skuRecsAll.data[0] : mergeSkuRecs(skuRecsAll.data, skus.data)) : undefined), [skuRecsAll.data, skus.data]);
  const skuRecs = { ...skuRecsAll, data: skuRecsData } as QueryState<SkuRecRow[]>;
  const byId = useMemo(() => new Map(all.map((m) => [m.unifiedCustomerId ?? '', m])), [all]);
  const others = extra.map((x) => byId.get(x));
  const merged = merging && metric && monthly.data && lines.data && upsell.data
    ? mergeMetrics(metric, others, monthly.data, lines.data, upsell.data, all)
    : undefined;
  const m = merging ? merged : metric;

  return (
    <div className="flex flex-col gap-400">
      <MergePreview id={id} metric={metric} merged={merged} extra={extra} onExtra={setExtra} all={all}
        profiles={profiles.data ?? []} byId={byId} />

      <Loaded q={profile} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*4)]" />}>
        {(p) => (p ? <ProfileStrip p={p} m={m} merged={merging ? ids.length : 0} /> : <Card><Empty>This customer isn't in the unified customer table.</Empty></Card>)}
      </Loaded>

      {!merging && cascade.data && cascade.data.pattern !== 'Recovered' && (
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

      <Card title="Customer journey" subtitle="Two years of this customer, acted out. Press play.">
        <Loaded q={monthly} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
          {(rows) => (
            <CustomerJourney rows={rows} name={profile.data?.customerName ?? m?.customerName ?? 'this customer'}
              customerType={m?.customerType ?? profile.data?.customerType} lifecycle={m?.lifecycleStage ?? profile.data?.lifecycleStage}
              riskBand={m?.churnRiskBand} />
          )}
        </Loaded>
      </Card>

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Sales" subtitle="Monthly net sales, this year vs. last year">
          <Loaded q={monthly} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*8)]" />}>
            {(rows) => rows.length ? <SalesYoY rows={rows} /> : <Empty>No orders in the last 24 months.</Empty>}
          </Loaded>
        </Card>
        <Card className="lg:col-span-4" title="Churn risk drivers" subtitle="What moves this customer's score">
          {m ? <Drivers m={m} /> : <Empty>No purchase history to score.</Empty>}
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
            {(rows) => <Returns rows={rows} m={m} />}
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
            {(rows) => <Marketing rows={rows} m={m} p={profile.data ?? null} />}
          </Loaded>
        </Card>
        <Card className="lg:col-span-6" title="Support" subtitle="Zendesk tickets">
          <Loaded q={timeline} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*7)]" />}>
            {(rows) => <Support rows={rows} m={m} />}
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

function ProfileStrip({ p, m, merged }: { p: ProfileRow; m: MetricRow | undefined; merged: number }) {
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
          {merged
            ? <><strong className="text-foreground">Preview: {merged} records merged</strong> · {count(p.linkedSourceRecords)} source records</>
            : <>{count(p.linkedSourceRecords)} source records · match confidence {pct(p.identityConfidence, 0)}</>}
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

// ---------------------------------------------------------------------------------------------
// Merge preview

/** Maps a query's data (keeping its loading / error state); `f` runs only when the data changes. */
function useMapped<T, U>(q: QueryState<T>, f: (t: T) => U): QueryState<U> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => (q.data === undefined ? undefined : f(q.data)), [q.data]);
  return { ...q, data } as QueryState<U>;
}

/** One record's list as-is, or several records' lists combined. */
const combine = <T, U>(f: (lists: T[]) => U) => (lists: T[]): U => (lists.length === 1 ? (lists[0] as unknown as U) : f(lists));

function MergePreview({ id, metric, merged, extra, onExtra, all, profiles, byId }: {
  id: string; metric: MetricRow | undefined; merged: MetricRow | undefined; extra: string[]; onExtra: (ids: string[]) => void;
  all: MetricRow[]; profiles: (ProfileRow | null)[]; byId: Map<string, MetricRow>;
}) {
  const { session } = useAuth();
  const email = (session?.user?.email ?? '').toLowerCase();
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState<Record<string, 'saving' | 'done' | string>>({});
  const candidates = useQuery('merge-candidates', fetchMergeCandidates);
  const suggestions = useMemo(() => (candidates.data ?? [])
    .filter((c) => c.primaryCustomerId === id || c.secondaryCustomerId === id)
    .map((c) => {
      const mine = c.primaryCustomerId === id;
      return {
        row: c, other: (mine ? c.secondaryCustomerId : c.primaryCustomerId) ?? '',
        name: (mine ? c.secondaryCustomerName : c.primaryCustomerName) ?? '', type: (mine ? c.secondaryCustomerType : c.primaryCustomerType) ?? '',
        score: n(c.score), reasons: c.reasons ?? '',
      };
    })
    .sort((a, b) => b.score - a.score), [candidates.data, id]);
  const options = useMemo<ComboOption[]>(() => {
    const seen = new Set<string>([id]);
    const out: ComboOption[] = [];
    for (const s of suggestions) if (!seen.has(s.other)) { seen.add(s.other); out.push({ value: s.other, label: s.name, hint: `${s.type} · suggested ${pct(s.score, 0)}` }); }
    for (const r of [...all].sort((a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''))) {
      const v = r.unifiedCustomerId ?? '';
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push({ value: v, label: r.customerName ?? v, hint: [r.customerType, r.city && r.state ? `${r.city}, ${r.state}` : null].filter(Boolean).join(' · ') });
    }
    return out;
  }, [all, id, suggestions]);
  const nameOf = (x: string) => byId.get(x)?.customerName ?? profiles.find((p) => p?.unifiedCustomerId === x)?.customerName
    ?? suggestions.find((s) => s.other === x)?.name ?? x;

  const propose = async (other: string) => {
    const s = suggestions.find((x) => x.other === other);
    const candidate = s?.row ?? ({
      primaryCustomerId: id, secondaryCustomerId: other, primaryCustomerName: nameOf(id), secondaryCustomerName: nameOf(other),
    } as MergeCandidateRow);
    setProposed((p) => ({ ...p, [other]: 'saving' }));
    try {
      await proposeMerge(candidate, email || 'unknown', 'Proposed from the Customer 360 merge preview');
      setProposed((p) => ({ ...p, [other]: 'done' }));
    } catch (e) {
      setProposed((p) => ({ ...p, [other]: e instanceof Error ? e.message : String(e) }));
    }
  };

  if (!open && !extra.length) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-300 rounded-lg border border-dashed border-border bg-card px-400 py-300">
        <div className="flex items-start gap-200 text-300">
          <GitMerge aria-hidden className="mt-100 icon-size-200 text-muted-foreground" />
          <span>
            <strong className="font-semibold">Preview a merge.</strong>{' '}
            <span className="text-muted-foreground">See this customer combined with other records as one identity, re-scored, before anyone proposes it. Nothing is saved.</span>
            {suggestions.length > 0 && <span className="ml-100 rounded-full bg-muted px-200 text-200 font-semibold">{suggestions.length} likely match{suggestions.length > 1 ? 'es' : ''}</span>}
          </span>
        </div>
        <button type="button" onClick={() => { setOpen(true); if (suggestions[0]) onExtra([suggestions[0].other]); }}
          className="inline-flex items-center gap-100 rounded-md border border-foreground px-300 py-200 font-heading text-200 font-semibold uppercase tracking-wider hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <GitMerge aria-hidden className="icon-size-200" />{suggestions.length ? 'Preview the likely match' : 'Preview a merge'}
        </button>
      </section>
    );
  }

  const rows = [id, ...extra].map((x) => ({ id: x, m: x === id ? metric : byId.get(x), p: profiles.find((p) => p?.unifiedCustomerId === x) ?? null }));
  const systems = (p: ProfileRow | null) => [p?.inErp && 'ERP', p?.inShopify && 'Shopify', p?.inKlaviyo && 'Klaviyo', p?.inZendesk && 'Zendesk'].filter(Boolean).join(', ') || '—';
  const TH = 'px-300 py-200 text-left font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground';
  const TD = 'px-300 py-200 align-top';
  return (
    <section className="flex flex-col gap-300 rounded-lg border-2 border-primary bg-card p-400" aria-labelledby="merge-preview-title">
      <header className="flex flex-wrap items-start justify-between gap-300">
        <div>
          <h2 id="merge-preview-title" className="flex items-center gap-200 font-heading text-400 font-semibold uppercase tracking-wider">
            <GitMerge aria-hidden className="icon-size-300" />Merge preview
          </h2>
          <p className="text-200 text-muted-foreground">
            {extra.length
              ? `Showing ${extra.length + 1} records as one identity. Every card below is the combined customer, re-scored with the same rules as the Fabric rebuild. Nothing is saved.`
              : 'Add the records you think are the same customer.'}
          </p>
        </div>
        <button type="button" onClick={() => { onExtra([]); setOpen(false); }}
          className="inline-flex items-center gap-100 rounded-md border border-border px-300 py-200 text-200 font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden className="icon-size-200" />Stop preview
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-300">
        <Combobox multiple label="Records to combine" value={extra} onChange={onExtra} options={options} allLabel="None"
          placeholder="Search by name, type or city…" widthClass="min-w-[calc(var(--spacing-800)*10)]" />
        {suggestions.filter((s) => !extra.includes(s.other)).slice(0, 3).map((s) => (
          <button key={s.other} type="button" onClick={() => onExtra([...extra, s.other])} title={s.reasons}
            className="rounded-full border border-dashed border-foreground/50 px-300 py-100 text-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            + {s.name} <span className="text-muted-foreground">· {pct(s.score, 0)} match</span>
          </button>
        ))}
      </div>

      {extra.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-300">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Record</th><th className={TH}>Systems</th><th className={cn(TH, 'text-right')}>Net sales · 12 mo</th>
                <th className={cn(TH, 'text-right')}>Orders</th><th className={cn(TH, 'text-right')}>Lines</th><th className={TH}>Churn risk</th>
                <th className={cn(TH, 'text-right')}>Upsell est.</th><th className={TH}>Merge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = suggestions.find((x) => x.other === r.id);
                const state = proposed[r.id];
                return (
                  <tr key={r.id} className="border-b border-border">
                    <td className={TD}>
                      <div className="font-semibold">{nameOf(r.id)}{i === 0 && <span className="ml-100 rounded-sm bg-muted px-100 text-100 uppercase tracking-wider">survivor</span>}</div>
                      <div className="text-200 text-muted-foreground">
                        {[r.p?.customerType ?? r.m?.customerType, r.p?.primaryEmail, s && `${pct(s.score, 0)} match: ${s.reasons}`].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className={cn(TD, 'text-200')}>{systems(r.p)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{money(r.m?.netSalesTtm ?? 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{count(r.m?.ordersTtm ?? 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{count(r.m?.productLinesTtm ?? 0)}</td>
                    <td className={TD}>{r.m ? <RiskBadge band={r.m.churnRiskBand} score={r.m.churnRiskScore} /> : <span className="text-200 text-muted-foreground">not scored</span>}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{money(r.m?.upsellValueEst ?? 0)}</td>
                    <td className={TD}>
                      {i === 0 ? <span className="text-200 text-muted-foreground">keeps this ID</span>
                        : state === 'done' ? <span className="inline-flex items-center gap-100 text-200 font-semibold text-[color:var(--color-status-good)]"><Check aria-hidden className="icon-size-100" />Proposed</span>
                        : state === 'saving' ? <span className="text-200 text-muted-foreground">Saving…</span>
                        : (
                          <>
                            <button type="button" onClick={() => void propose(r.id)}
                              className="rounded-md border border-foreground px-200 py-100 text-200 font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              Propose merge
                            </button>
                            {state && <div role="alert" className="mt-100 text-200 text-[color:var(--color-status-critical)]">{state}</div>}
                          </>
                        )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/50 font-semibold">
                <td className={TD}>Combined identity</td>
                <td className={cn(TD, 'text-200')}>{systems(mergeProfiles(rows.map((r) => r.p)))}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{money(merged?.netSalesTtm)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{count(merged?.ordersTtm)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{count(merged?.productLinesTtm)}</td>
                <td className={TD}>{merged ? <RiskBadge band={merged.churnRiskBand} score={merged.churnRiskScore} /> : '…'}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{money(merged?.upsellValueEst)}</td>
                <td className={cn(TD, 'text-200 font-normal text-muted-foreground')}>preview only</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-200 text-200 text-muted-foreground">
            Proposals go to the Identity page for a data steward to approve; approved merges are applied on the next Fabric rebuild.
            Prospects and unresolved records have no sales facts, so they add identity (systems, consent, activity) but not revenue.
          </p>
        </div>
      )}
    </section>
  );
}
