// "Data lineage" panel at the bottom of the Portfolio page: how every number is built, from the source systems
// through the lakehouse tables (dimensions, facts, aggregates) to the calculation each visual runs.
// Content mirrors fabric/notebooks/*.py and src/lib/c360.ts; keep it in step when either changes.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';

import { rangeLabel, type Filters } from '@/lib/c360';
import { cn } from '@/lib/utils';
import { UPSTREAM, VISUALS, VISUAL_BY_ID, slicerPredicates, type VisualId, type VisualLineage } from '@/lib/visual-lineage';

const TABS = [
  { id: 'visuals', label: 'Visuals' },
  { id: 'flow', label: 'Pipeline' },
  { id: 'tables', label: 'Tables' },
  { id: 'scores', label: 'Scores' },
] as const;
export type LineageTab = (typeof TABS)[number]['id'];

const TH = 'px-300 py-200 text-left font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground';
const TD = 'px-300 py-300 align-top';
const H3 = 'font-heading text-300 font-semibold uppercase tracking-wider';

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-muted px-100 font-mono text-200 text-foreground">{children}</code>;
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="whitespace-pre-wrap break-words font-mono text-200 leading-relaxed text-foreground">{children}</pre>;
}

export function DataLineage({ filters, tab, onTab, visual, onVisual }: {
  filters: Filters; tab: LineageTab; onTab: (t: LineageTab) => void; visual: VisualId; onVisual: (v: VisualId) => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-500 text-card-foreground" aria-labelledby="lineage-title">
      <header className="mb-400">
        <h2 id="lineage-title" className="font-heading text-400 font-semibold uppercase tracking-wider">Data lineage</h2>
        <p className="mt-100 text-200 text-muted-foreground">
          How every number on this page is built: source systems → lakehouse tables → the query and calculation each visual runs.
          Use the <strong className="text-foreground">Lineage</strong> button on any visual to jump to it here. Built by the Fabric notebooks
          in <Code>c360_lakehouse</Code>; scores as of 28 Sep 2026.
        </p>
      </header>

      <div role="tablist" aria-label="Lineage sections" className="mb-400 flex flex-wrap gap-400 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`lineage-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`lineage-panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className={cn('-mb-px border-b-2 py-200 font-heading text-300 font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`lineage-panel-${tab}`} aria-labelledby={`lineage-tab-${tab}`}>
        {tab === 'visuals' && <Visuals filters={filters} visual={visual} onVisual={onVisual} />}
        {tab === 'flow' && <Pipeline />}
        {tab === 'tables' && <Tables />}
        {tab === 'scores' && <Scores />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Visuals: per-visual lineage

const GROUPS = ['KPI tiles', 'Charts', 'SKU explorer', 'Tables'] as const;

const TIMING: Record<VisualLineage['timing'], string> = {
  period: 'Follows the period picker',
  snapshot: 'Snapshot: trailing 12 months to 28 Sep 2026',
  both: 'Period and snapshot figures',
};

function Visuals({ filters, visual, onVisual }: { filters: Filters; visual: VisualId; onVisual: (v: VisualId) => void }) {
  const v = VISUAL_BY_ID.get(visual) ?? VISUALS[0];
  return (
    <div className="grid grid-cols-1 gap-500 lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
      <nav aria-label="Visuals on this page" className="flex flex-col gap-300">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-100 font-heading text-100 font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
            <ul className="flex flex-wrap gap-100 lg:flex-col">
              {VISUALS.filter((x) => x.group === g).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => onVisual(x.id)} aria-current={x.id === v.id ? 'true' : undefined}
                    className={cn('w-full rounded-md px-200 py-100 text-left text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      x.id === v.id ? 'bg-foreground font-semibold text-background' : 'hover:bg-accent')}>
                    {x.title.replace('SKU explorer: ', '')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <VisualDetail v={v} filters={filters} />
    </div>
  );
}

function Stage({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-100 rounded-md border border-border bg-background p-300', className)}>
      <div className="font-heading text-100 font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
      <ArrowDown className="icon-size-200 md:hidden" /><ArrowRight className="icon-size-200 hidden md:block" />
    </div>
  );
}

function RoleTag({ role }: { role: string }) {
  return (
    <span className="rounded-sm border border-border px-100 font-heading text-100 font-semibold uppercase tracking-wider text-muted-foreground">{role}</span>
  );
}

function VisualDetail({ v, filters }: { v: VisualLineage; filters: Filters }) {
  const upstream = [...new Set(v.tables.flatMap((t) => UPSTREAM[t.name]?.from ?? []))];
  const notebooks = [...new Set(v.tables.map((t) => UPSTREAM[t.name]?.notebook).filter(Boolean))];
  const active = slicerPredicates(filters);
  return (
    <article className="flex min-w-0 flex-col gap-500" aria-labelledby="visual-lineage-title">
      <header className="flex flex-wrap items-baseline justify-between gap-200">
        <div>
          <h3 id="visual-lineage-title" className="font-heading text-500 font-semibold">{v.title}</h3>
          <p className="text-200 text-muted-foreground">{v.render} · {v.mark}</p>
        </div>
        <span className="rounded-full bg-muted px-300 py-100 text-200">{TIMING[v.timing]}</span>
      </header>

      <div className="grid grid-cols-1 items-stretch gap-200 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]" aria-label="Lineage flow">
        <Stage title={`Built from · ${notebooks.join(', ')}`}>
          <ul className="flex flex-col gap-100">{upstream.map((u) => <li key={u}><Code>{u}</Code></li>)}</ul>
        </Stage>
        <Arrow />
        <Stage title="Gold table(s) read">
          <ul className="flex flex-col gap-200">
            {v.tables.map((t) => (
              <li key={t.name} className="flex flex-col gap-100">
                <span className="flex flex-wrap items-center gap-100"><Code>{t.name}</Code><RoleTag role={t.role} /></span>
                <span className="text-200 text-muted-foreground">one row per {t.grain}</span>
              </li>
            ))}
          </ul>
        </Stage>
        <Arrow />
        <Stage title="Query (SQL endpoint)">
          <p className="text-200">{v.slicers}</p>
          <p className="text-200 text-muted-foreground">Filtering, grouping and sums run in Fabric; only the result comes back.</p>
        </Stage>
        <Arrow />
        <Stage title="In the browser">
          <ol className="flex list-decimal flex-col gap-100 pl-400 text-200">{v.browser.map((b) => <li key={b}>{b}</li>)}</ol>
        </Stage>
        <Arrow />
        <Stage title="Rendered as" className="border-foreground">
          <p className="text-300 font-semibold">{v.render}</p>
          <p className="text-200 text-muted-foreground">{v.mark}</p>
        </Stage>
      </div>

      <div className="grid grid-cols-1 gap-500 xl:grid-cols-2">
        <div className="min-w-0">
          <h4 className={cn(H3, 'mb-100')}>Dimensions</h4>
          <p className="mb-200 text-200 text-muted-foreground">Columns that slice the data: group by, axes, colour, filters.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-300">
              <thead><tr className="border-b border-border"><th className={TH}>Column</th><th className={TH}>Table</th><th className={TH}>Used as</th></tr></thead>
              <tbody>
                {v.dimensions.map((d) => (
                  <tr key={`${d.table}.${d.column}`} className="border-b border-border last:border-0">
                    <td className={TD}><Code>{d.column}</Code></td>
                    <td className={cn(TD, 'text-200 text-muted-foreground')}>{d.table}</td>
                    <td className={cn(TD, 'text-200')}>{d.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="min-w-0">
          <h4 className={cn(H3, 'mb-100')}>Measures (facts)</h4>
          <p className="mb-200 text-200 text-muted-foreground">Numeric columns that are aggregated, and the calculations built on them.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-300">
              <thead><tr className="border-b border-border"><th className={TH}>Measure</th><th className={TH}>Calculation</th><th className={TH}>Computed in</th></tr></thead>
              <tbody>
                {v.measures.map((m, i) => (
                  <tr key={`${m.name}-${i}`} className="border-b border-border last:border-0">
                    <td className={cn(TD, 'font-semibold')}>{m.name}</td>
                    <td className={TD}><Formula>{m.expr}</Formula></td>
                    <td className={cn(TD, 'text-200 text-muted-foreground')}>{m.table === 'browser' ? 'Browser' : m.table}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-500 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <h4 className={cn(H3, 'mb-100')}>Query, with your current filters</h4>
          <p className="mb-200 text-200 text-muted-foreground">
            Equivalent SQL for what the app asks the lakehouse SQL endpoint right now
            ({active.length ? `${active.length} slicer${active.length > 1 ? 's' : ''} set` : 'no slicers set'}; period {rangeLabel(filters.range)}).
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-background p-300"><Formula>{v.sql(filters)}</Formula></div>
        </div>
        <div className="flex min-w-0 flex-col gap-400">
          <div>
            <h4 className={cn(H3, 'mb-200')}>Visual encoding</h4>
            <table className="w-full border-collapse text-300">
              <tbody>
                {v.encoding.map(([ch, field]) => (
                  <tr key={ch} className="border-b border-border last:border-0">
                    <td className="py-100 pr-300 align-top font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{ch}</td>
                    <td className="py-100 align-top">{field}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {v.notes && (
            <div>
              <h4 className={cn(H3, 'mb-200')}>Notes</h4>
              <ul className="flex list-disc flex-col gap-100 pl-400 text-200">{v.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </article>
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
          <h3 className={cn(H3, 'mb-200')}>Notebooks (run in order by c360_runner)</h3>
          <ol className="flex flex-col gap-200 text-300">
            {NOTEBOOKS.map(([nb, what], i) => (
              <li key={nb}><span className="text-muted-foreground tabular-nums">{i + 1}.</span> <Code>{nb}</Code> <span className="text-muted-foreground">· {what}</span></li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className={cn(H3, 'mb-200')}>Identity resolution</h3>
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
        <h3 className={H3}>Churn risk score (0–100)</h3>
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
          <h3 className={H3}>Upsell</h3>
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
          <h3 className={H3}>Next best action (first rule that matches)</h3>
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
