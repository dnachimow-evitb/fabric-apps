// "Data lineage" panel at the bottom of the Portfolio page: how every number is built, from the source systems
// through the lakehouse tables (dimensions, facts, aggregates) to the calculation each visual runs.
// Content mirrors fabric/notebooks/*.py and src/lib/c360.ts; keep it in step when either changes.
import { useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { cityLabel, rangeLabel, type Filters } from '@/lib/c360';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'flow', label: 'Pipeline' },
  { id: 'tables', label: 'Tables' },
  { id: 'calcs', label: 'Calculations' },
  { id: 'scores', label: 'Scores' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const TH = 'px-300 py-200 text-left font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground';
const TD = 'px-300 py-300 align-top';

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-muted px-100 font-mono text-200 text-foreground">{children}</code>;
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="whitespace-pre-wrap break-words font-mono text-200 leading-relaxed text-foreground">{children}</pre>;
}

export function DataLineage({ filters }: { filters: Filters }) {
  const [tab, setTab] = useState<Tab>('flow');
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-500 text-card-foreground" aria-labelledby="lineage-title">
      <header className="mb-400">
        <h2 id="lineage-title" className="font-heading text-400 font-semibold uppercase tracking-wider">Data lineage</h2>
        <p className="mt-100 text-200 text-muted-foreground">
          How every number on this page is built: source systems → lakehouse tables → the calculation each visual runs.
          Built by the Fabric notebooks in <Code>c360_lakehouse</Code>; scores as of 28 Sep 2026.
        </p>
      </header>

      <div role="tablist" aria-label="Lineage sections" className="mb-400 flex flex-wrap gap-400 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`lineage-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`lineage-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn('-mb-px border-b-2 py-200 font-heading text-300 font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`lineage-panel-${tab}`} aria-labelledby={`lineage-tab-${tab}`}>
        {tab === 'flow' && <Pipeline />}
        {tab === 'tables' && <Tables />}
        {tab === 'calcs' && <Calculations filters={filters} />}
        {tab === 'scores' && <Scores />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Pipeline

const STAGES: { name: string; where: string; items: string[] }[] = [
  { name: 'Sources', where: 'Test-data CSVs', items: ['ERP: wholesale accounts, orders, returns', 'Shopify: direct customers, orders', 'Klaviyo: profiles, campaigns, events', 'Zendesk: users, orgs, tickets'] },
  { name: 'Bronze', where: 'Files/bronze → bronze_* (14 tables)', items: ['Loaded as-is, every column a string', 'One table per source file'] },
  { name: 'Silver', where: 'silver_* (13 tables)', items: ['Typed and cleaned; emails normalised', 'Order lines joined to products', 'Identity map: every source record → one unified customer'] },
  { name: 'Gold', where: 'gold_* (dims, facts, aggregates)', items: ['Customer dimension', 'Customer × month fact', 'Per-customer metrics and scores', 'Product line and SKU aggregates'] },
  { name: 'This app', where: 'c360lakehouse connector', items: ['Read-only SQL analytics endpoint', 'Filters pushed down as WHERE clauses', 'Sums and counts run server-side'] },
];

const NOTEBOOKS: [string, string][] = [
  ['c360_customer_dimension', 'Bronze → silver, identity resolution, gold_dim_customer, merge candidates'],
  ['c360_customer_metrics', 'Monthly fact, product lines and penetration, churn / upsell scores, gold_customer_metrics'],
  ['c360_sku_risk', 'SKU performance, customer × SKU, affinity, SKU recommendations, risk and cascade tables'],
  ['c360_summary_export', 'Summary reports for review (not read by the app)'],
];

function Pipeline() {
  return (
    <div className="flex flex-col gap-500">
      <ol className="grid grid-cols-1 gap-300 md:grid-cols-5">
        {STAGES.map((s, i) => (
          <li key={s.name} className="relative flex flex-col gap-200 rounded-md border border-border bg-background p-300">
            <div className="flex items-baseline justify-between gap-200">
              <span className="font-heading text-300 font-semibold uppercase tracking-wider">{s.name}</span>
              <span className="text-200 text-muted-foreground tabular-nums">{i + 1}</span>
            </div>
            <div className="text-200 font-semibold text-muted-foreground">{s.where}</div>
            <ul className="flex list-disc flex-col gap-100 pl-400 text-200">
              {s.items.map((x) => <li key={x}>{x}</li>)}
            </ul>
            {i < STAGES.length - 1 && (
              <ArrowRight aria-hidden className="icon-size-200 absolute -right-300 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-card text-muted-foreground md:block" />
            )}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-2">
        <div>
          <h3 className="mb-200 font-heading text-300 font-semibold uppercase tracking-wider">Notebooks (run in order by c360_runner)</h3>
          <ol className="flex flex-col gap-200 text-300">
            {NOTEBOOKS.map(([nb, what], i) => (
              <li key={nb}><span className="text-muted-foreground tabular-nums">{i + 1}.</span> <Code>{nb}</Code> <span className="text-muted-foreground">· {what}</span></li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="mb-200 font-heading text-300 font-semibold uppercase tracking-wider">Identity resolution</h3>
          <p className="text-300">
            ERP accounts (wholesale) and Shopify customers (direct) are the anchors. Klaviyo and Zendesk records attach to an anchor by the
            first rule that matches: <strong>shared ID</strong> (or, for Zendesk users, their organisation's account),
            then <strong>normalised email</strong>, then <strong>email domain</strong> (wholesale). Unmatched records become their own customer. The result is
            {' '}<Code>silver_customer_identity_map</Code> (source record → <Code>unified_customer_id</Code>, rule, confidence).
          </p>
          <p className="mt-200 text-300 text-muted-foreground">
            Feedback loop: merges approved on the Identity tab are saved to the app database (<Code>dbo.MergeProposals</Code>), which is
            shortcut into the lakehouse as <Code>app_merge_proposal</Code> and applied on the next rebuild.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tables

type Kind = 'Dimension' | 'Bridge' | 'Fact' | 'Aggregate';

const TABLES: { name: string; kind: Kind; grain: string; from: string; usedBy: string }[] = [
  { name: 'gold_dim_customer', kind: 'Dimension', grain: 'Unified customer (incl. prospects)', from: 'silver_erp_customers, silver_shopify_customers, silver_klaviyo_profiles, silver_zendesk_users + identity map', usedBy: 'Customer 360 profile; attributes copied into the metrics and monthly tables' },
  { name: 'silver_products', kind: 'Dimension', grain: 'SKU', from: 'bronze_sales_products', usedBy: 'Product line and category on every sales line' },
  { name: 'silver_customer_identity_map', kind: 'Bridge', grain: 'Source record', from: 'All silver customer / profile / user tables (+ approved merges)', usedBy: 'Links every order, event and ticket to a unified customer' },
  { name: 'silver_orders · silver_order_lines', kind: 'Fact', grain: 'Order · order line', from: 'bronze_sales_orders, bronze_sales_order_lines', usedBy: 'Sales, orders, product lines bought' },
  { name: 'silver_returns', kind: 'Fact', grain: 'Return (RMA) line', from: 'bronze_returns', usedBy: 'Returns and return rate' },
  { name: 'silver_klaviyo_events', kind: 'Fact', grain: 'Marketing event', from: 'bronze_klaviyo_events + bronze_klaviyo_metrics', usedBy: 'Touches, engagements, product views' },
  { name: 'silver_zendesk_tickets', kind: 'Fact', grain: 'Support ticket', from: 'bronze_zendesk_tickets + bronze_zendesk_ticket_metrics', usedBy: 'Tickets, open / high-priority, CSAT' },
  { name: 'gold_customer_monthly', kind: 'Fact', grain: 'Customer × month', from: 'Orders, returns, campaign events, tickets summed per month + slicer attributes', usedBy: 'Net sales, return rate and engagement KPIs; sales & returns trend; map (period metrics)' },
  { name: 'gold_customer_sku', kind: 'Fact', grain: 'Customer × SKU (24 months)', from: 'silver_order_lines, silver_returns', usedBy: 'SKU explorer: who buys a SKU' },
  { name: 'gold_customer_metrics', kind: 'Aggregate', grain: 'Customer (Wholesale + Direct)', from: 'All silver facts + gold_dim_customer + gold_customer_upsell', usedBy: 'Revenue at risk, upsell and product-line KPIs; churn × upsell matrix; SKU diversification; priority table; map (snapshot); filter options' },
  { name: 'gold_product_line_penetration', kind: 'Aggregate', grain: 'Customer type × product line', from: 'silver_orders, silver_order_lines, silver_products', usedBy: 'Product line penetration chart' },
  { name: 'gold_customer_product_line · gold_customer_upsell', kind: 'Aggregate', grain: 'Customer × product line · top 3 recs', from: 'Order lines, product views, penetration', usedBy: 'Upsell value in metrics; Customer 360 product mix' },
  { name: 'gold_sku_performance · gold_sku_affinity', kind: 'Aggregate', grain: 'SKU × customer type · SKU pair', from: 'Order lines, returns, tickets citing an order', usedBy: 'SKU explorer: performance and "also bought"' },
  { name: 'gold_risk_concentration · gold_issue_cascade · gold_driver_correlation', kind: 'Aggregate', grain: 'Various', from: 'gold_customer_metrics, gold_customer_monthly', usedBy: 'Risk tab' },
];

const KIND_NOTE: Record<Kind, string> = {
  Dimension: 'Descriptive attributes you filter and group by',
  Bridge: 'Maps source-system keys to the unified customer',
  Fact: 'Events and amounts you sum',
  Aggregate: 'Pre-computed metrics and scores',
};

function Tables() {
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const shown = TABLES.filter((t) => kind === 'all' || t.kind === kind);
  return (
    <div className="flex flex-col gap-300">
      <div className="flex flex-wrap items-center gap-200" role="group" aria-label="Table type">
        {(['all', 'Dimension', 'Bridge', 'Fact', 'Aggregate'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
            className={cn('rounded-full border px-300 py-100 text-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              kind === k ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}>
            {k === 'all' ? 'All tables' : `${k === 'Bridge' ? 'Bridge' : `${k}s`}`}
          </button>
        ))}
        {kind !== 'all' && <span className="text-200 text-muted-foreground">{KIND_NOTE[kind]}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-300">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Table</th><th className={TH}>Type</th><th className={TH}>Grain (one row per)</th>
              <th className={TH}>Built from</th><th className={TH}>Feeds</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.name} className="border-b border-border last:border-0">
                <td className={TD}><Code>{t.name}</Code></td>
                <td className={cn(TD, 'whitespace-nowrap')}>{t.kind}</td>
                <td className={TD}>{t.grain}</td>
                <td className={cn(TD, 'text-200 text-muted-foreground')}>{t.from}</td>
                <td className={cn(TD, 'text-200')}>{t.usedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Calculations

const CALCS: { visual: string; table: string; calc: string; filters: string }[] = [
  { visual: 'Net sales', table: 'gold_customer_monthly', calc: 'SUM(net_sales)\nvs. the same-length period just before', filters: 'All slicers + period' },
  { visual: 'Return rate', table: 'gold_customer_monthly', calc: 'SUM(returns_amount) / SUM(net_sales)\nreturns counted in the month refunded', filters: 'All slicers + period' },
  { visual: 'Marketing engagement', table: 'gold_customer_monthly', calc: 'SUM(marketing_engagements) / SUM(marketing_touches)\ntouches = campaign email/SMS received\nengagements = opened/clicked email, clicked SMS\nsupport tickets = SUM(tickets)', filters: 'All slicers + period' },
  { visual: 'Revenue at risk', table: 'gold_customer_metrics', calc: 'SUM(revenue_at_risk)\nrevenue_at_risk = net_sales_ttm × churn_risk_score / 100\nhigh-risk = COUNT where churn_risk_band = High', filters: 'All slicers; snapshot (ignores period)' },
  { visual: 'Upsell opportunity', table: 'gold_customer_metrics', calc: 'SUM(upsell_value_est)\n= each customer\'s top-3 recommendations (see Scores)', filters: 'All slicers; snapshot' },
  { visual: 'Product lines / customer', table: 'gold_customer_metrics', calc: 'AVG(product_lines_ttm) WHERE orders_ttm > 0', filters: 'All slicers; snapshot' },
  { visual: 'Customer map', table: 'gold_customer_monthly + gold_customer_metrics', calc: 'Period: SUM(net_sales, returns, …) GROUP BY city, state\nSnapshot: COUNT(customers), SUM(revenue_at_risk), AVG(churn_risk_score),\n  SUM(upsell_value_est), COUNT(High risk) GROUP BY city, state', filters: 'All slicers except the map\'s own city selection' },
  { visual: 'Churn risk × upsell', table: 'gold_customer_metrics', calc: 'One dot per customer: x = churn_risk_score, y = upsell_score,\nsize = net_sales_ttm', filters: 'All slicers; snapshot' },
  { visual: 'SKU diversification', table: 'gold_customer_metrics', calc: 'COUNT(customers) GROUP BY product_lines_ttm WHERE orders_ttm > 0', filters: 'All slicers; snapshot' },
  { visual: 'Net sales and returns', table: 'gold_customer_monthly', calc: 'SUM(net_sales), SUM(returns_amount) GROUP BY month', filters: 'All slicers + period' },
  { visual: 'Product line penetration', table: 'gold_product_line_penetration', calc: 'active customers (ordered in last 365 days) who bought the line in 12 months\n÷ all active customers, per customer type', filters: 'Customer type only (pre-aggregated)' },
  { visual: 'SKU explorer', table: 'gold_sku_performance, gold_customer_sku, gold_sku_affinity', calc: 'SKU: 12-month net sales, units, buyers, returns ÷ sales, YoY\nBuyers: per-customer SKU sales\nAlso bought: confidence = buyers of both ÷ buyers of this SKU\n  lift = confidence ÷ share of customers buying the other SKU', filters: 'SKUs: customer type; buyers: type, region, owner' },
  { visual: 'Priority customers', table: 'gold_customer_metrics', calc: 'Top 15 by priority_score\npriority_score = revenue_at_risk × 0.6 + upsell_value_est × 2', filters: 'All slicers; snapshot' },
];

/** The current slicers, written as the WHERE clause the connector sends. */
function describeWhere(f: Filters): string[] {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const w: string[] = [];
  if (f.customerType !== 'all') w.push(`customer_type = ${q(f.customerType)}`);
  if (f.region !== 'all') w.push(`region = ${q(f.region)}`);
  if (f.states.length) w.push(`state IN (${f.states.map(q).join(', ')})`);
  if (f.cities.length) w.push(`city IN (${[...new Set(f.cities.map((c) => cityLabel(c).split(', ')[0]))].map(q).join(', ')})`);
  if (f.owner !== 'all') w.push(`account_manager = ${q(f.owner)}`);
  if (f.riskBand !== 'all') w.push(`churn_risk_band = ${q(f.riskBand)}`);
  if (f.lifecycle !== 'all') w.push(`lifecycle_stage = ${q(f.lifecycle)}`);
  if (f.productLine !== 'all') w.push(`product_lines_bought LIKE ${q(`%|${f.productLine}|%`)}`);
  if (f.proOnly) w.push('is_pro_member = 1');
  return w;
}

function Calculations({ filters }: { filters: Filters }) {
  const where = describeWhere(filters);
  const month = `month BETWEEN '${filters.range.from}-01' AND '${filters.range.to}-01'`;
  return (
    <div className="flex flex-col gap-400">
      <div className="rounded-md border border-border bg-background p-300">
        <div className="mb-100 font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Filters applied right now</div>
        <Formula>{`WHERE ${where.length ? where.join('\n  AND ') : '1 = 1  -- no slicers'}\n  AND ${month}   -- period (${rangeLabel(filters.range)}), monthly table only`}</Formula>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-300">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Visual</th><th className={TH}>Reads</th><th className={TH}>Calculation</th><th className={TH}>Filtered by</th>
            </tr>
          </thead>
          <tbody>
            {CALCS.map((c) => (
              <tr key={c.visual} className="border-b border-border last:border-0">
                <td className={cn(TD, 'font-semibold')}>{c.visual}</td>
                <td className={TD}><Code>{c.table}</Code></td>
                <td className={TD}><Formula>{c.calc}</Formula></td>
                <td className={cn(TD, 'text-200 text-muted-foreground')}>{c.filters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-200 text-muted-foreground">
        <strong className="text-foreground">Snapshot</strong> figures are computed once per rebuild over the trailing 12 months to 28 Sep 2026
        (TTM; the prior 12 months for year-over-year), so the period picker doesn't change them. <strong className="text-foreground">Period</strong> figures
        are summed live from the monthly table for the months you pick.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Scores

const CHURN_DRIVERS: [string, string, string][] = [
  ['Sales decline', 'up to 35', 'max(0, −sales_yoy) × 50'],
  ['Overdue order', 'up to 25', '(days_since_order − usual gap) / usual gap × 12; usual gap 45 days wholesale, 150 direct'],
  ['Service issues', 'up to 18', 'high-priority open × 6 + open × 2 + bad CSAT (12 mo) × 4 + tickets (90 days) × 2'],
  ['High returns', 'up to 12', '(return_rate_ttm − 6%) × 150'],
  ['Disengaging', 'up to 12', '8 if 90-day engagement < half of the prior rate (and prior > 5%); +4 if no engagement in 90 days'],
  ['Narrow product mix', 'up to 5', '5 for one product line, 3 for two'],
];

const ACTIONS: [string, string][] = [
  ['High-priority ticket open and churn risk ≥ 60', 'Resolve ticket(s), then owner call'],
  ['Churn risk ≥ 60 and sales down > 15% YoY', 'Retention review'],
  ['Return rate > 12%', 'Investigate returns'],
  ['Upsell score ≥ 60', 'Pitch the top recommended product line'],
  ['No marketing response in 90+ days', 'Re-engage'],
  ['Otherwise', 'Maintain cadence'],
];

function Scores() {
  return (
    <div className="grid grid-cols-1 gap-500 lg:grid-cols-2">
      <div className="flex flex-col gap-200">
        <h3 className="font-heading text-300 font-semibold uppercase tracking-wider">Churn risk score (0–100)</h3>
        <Formula>{'churn_risk_score = min(100, 5 + Σ driver points)\nband: High ≥ 60 · Medium ≥ 35 · Low < 35'}</Formula>
        <table className="w-full border-collapse text-300">
          <thead><tr className="border-b border-border"><th className={TH}>Driver</th><th className={TH}>Points</th><th className={TH}>Rule</th></tr></thead>
          <tbody>
            {CHURN_DRIVERS.map(([d, p, rule]) => (
              <tr key={d} className="border-b border-border last:border-0">
                <td className={cn(TD, 'font-semibold')}>{d}</td><td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{p}</td>
                <td className={cn(TD, 'text-200')}>{rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-200 text-muted-foreground">The top four drivers are stored per customer (<Code>churn_drivers</Code>), so every point is explainable.</p>
      </div>

      <div className="flex flex-col gap-400">
        <div className="flex flex-col gap-200">
          <h3 className="font-heading text-300 font-semibold uppercase tracking-wider">Upsell</h3>
          <Formula>{`For each product line a customer did not buy in 12 months:
estimated_annual_value = peer_penetration × avg_spend_per_buyer
                         × 1.5 if viewed in last 90 days (else 1)
                         × (1 − churn_risk_score / 200)
upsell_value_est = sum of the top 3 lines
upsell_score     = percentile rank of upsell_value_est
                   within customer type × 100`}</Formula>
          <p className="text-200 text-muted-foreground">Peers are customers of the same type (Wholesale or Direct).</p>
        </div>
        <div className="flex flex-col gap-200">
          <h3 className="font-heading text-300 font-semibold uppercase tracking-wider">Next best action (first rule that matches)</h3>
          <ol className="flex flex-col gap-100 text-300">
            {ACTIONS.map(([when, action], i) => (
              <li key={when}><span className="text-muted-foreground tabular-nums">{i + 1}.</span> {when} <ArrowRight aria-hidden className="icon-size-100 inline align-middle text-muted-foreground" /> <strong>{action}</strong></li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
