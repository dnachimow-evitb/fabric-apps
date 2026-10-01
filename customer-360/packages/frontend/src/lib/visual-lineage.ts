// Per-visual lineage for the Portfolio page: which lakehouse tables each visual reads, which columns act as
// dimensions (group by / axes / filters) and which as measures (aggregated facts), the query it sends, what the
// browser does with the result, and how it is drawn. Mirrors src/lib/c360.ts, the views and fabric/notebooks.
// Keep it in step when a query or visual changes.
import { cityName, previousRange, type Filters } from './c360';

export type VisualId =
  | 'kpi-sales' | 'kpi-returns' | 'kpi-engagement' | 'kpi-risk' | 'kpi-upsell' | 'kpi-lines'
  | 'map' | 'matrix' | 'breadth' | 'trend' | 'penetration'
  | 'sku-chart' | 'sku-watch' | 'sku-buyers' | 'sku-affinity' | 'priority';

export type TableRole = 'Fact' | 'Aggregate' | 'Dimension';

export interface LineageTable { name: string; role: TableRole; grain: string }

export interface VisualLineage {
  id: VisualId;
  title: string;
  group: 'KPI tiles' | 'Charts' | 'SKU explorer' | 'Tables';
  /** How it is drawn. */
  render: string;
  /** What one mark / row / value on screen represents. */
  mark: string;
  timing: 'period' | 'snapshot' | 'both';
  tables: LineageTable[];
  /** Columns used to slice: group by, axes, colour, filters. */
  dimensions: { column: string; table: string; use: string }[];
  /** Aggregated fact columns and the expressions built from them. */
  measures: { name: string; expr: string; table: string }[];
  /** Which page slicers reach this visual. */
  slicers: string;
  /** The query sent to the SQL analytics endpoint, written as equivalent SQL for the current filters. */
  sql: (f: Filters) => string;
  /** Steps done in the browser after the query returns. */
  browser: string[];
  /** Visual channel → field. */
  encoding: [string, string][];
  /** Anything else worth knowing (shared queries, caveats). */
  notes?: string[];
}

/** Silver / gold tables each gold table is built from (see fabric/notebooks). */
export const UPSTREAM: Record<string, { notebook: string; from: string[] }> = {
  gold_customer_monthly: {
    notebook: 'c360_customer_metrics',
    from: ['silver_orders', 'silver_returns', 'silver_klaviyo_events', 'silver_zendesk_tickets', 'silver_customer_identity_map', 'gold_customer_metrics (slicer attributes)'],
  },
  gold_customer_metrics: {
    notebook: 'c360_customer_metrics',
    from: ['silver_orders', 'silver_order_lines', 'silver_returns', 'silver_klaviyo_events', 'silver_zendesk_tickets', 'silver_customer_identity_map', 'gold_dim_customer', 'gold_customer_upsell'],
  },
  gold_product_line_penetration: {
    notebook: 'c360_customer_metrics',
    from: ['silver_orders', 'silver_order_lines', 'silver_products', 'gold_dim_customer'],
  },
  gold_sku_performance: {
    notebook: 'c360_sku_risk',
    from: ['silver_order_lines', 'silver_orders', 'silver_returns', 'silver_zendesk_tickets', 'silver_products', 'gold_dim_customer'],
  },
  gold_customer_sku: {
    notebook: 'c360_sku_risk',
    from: ['silver_order_lines', 'silver_orders', 'silver_returns', 'silver_products', 'gold_dim_customer'],
  },
  gold_sku_affinity: { notebook: 'c360_sku_risk', from: ['gold_customer_sku', 'silver_products'] },
};

// ---------------------------------------------------------------------------------------------
// SQL helpers

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The page slicers as SQL predicates. `scope` limits them to the columns a table carries. */
export function slicerPredicates(f: Filters, scope: 'all' | 'basic' | 'type' = 'all'): string[] {
  const w: string[] = [];
  if (f.customerType !== 'all') w.push(`customer_type = ${q(f.customerType)}`);
  if (scope === 'type') return w;
  const inList = (col: string, xs: string[]) => (xs.length === 1 ? `${col} = ${q(xs[0])}` : `${col} IN (${xs.map(q).join(', ')})`);
  if (f.regions.length) w.push(inList('region', f.regions));
  if (scope === 'all' && f.states.length) w.push(`state IN (${f.states.map(q).join(', ')})`);
  if (scope === 'all' && f.cities.length) w.push(`city IN (${[...new Set(f.cities.map(cityName))].map(q).join(', ')})`);
  if (f.owners.length) w.push(inList('account_manager', f.owners));
  if (scope === 'basic') return w;
  if (f.riskBands.length) w.push(inList('churn_risk_band', f.riskBands));
  if (f.lifecycles.length) w.push(inList('lifecycle_stage', f.lifecycles));
  if (f.productLines.length) {
    const likes = f.productLines.map((l) => `product_lines_bought LIKE ${q(`%|${l}|%`)}`);
    w.push(likes.length === 1 ? likes[0] : `(${likes.join(' OR ')})`);
  }
  if (f.proOnly) w.push('is_pro_member = 1');
  return w;
}

const period = (r: { from: string; to: string }) => `month BETWEEN '${r.from}-01' AND '${r.to}-01'`;

function where(preds: string[]): string {
  return preds.length ? `WHERE ${preds.join('\n  AND ')}` : '-- no filters';
}

const totalsSql = (f: Filters, r: { from: string; to: string }) => `SELECT SUM(net_sales)             AS net_sales,
       SUM(returns_amount)        AS returns,
       SUM(orders)                AS orders,
       SUM(marketing_touches)     AS touches,
       SUM(marketing_engagements) AS engagements,
       SUM(tickets)               AS tickets
FROM gold_customer_monthly
${where([...slicerPredicates(f), period(r)])}`;

function kpiTotalsSql(f: Filters): string {
  const prev = previousRange(f.range);
  return `-- selected period\n${totalsSql(f, f.range)};\n\n` + (prev
    ? `-- previous period of the same length (for the % change)\n${totalsSql(f, prev)};`
    : '-- no previous period: it would start before the data (Oct 2024)');
}

const METRICS_SQL = (f: Filters, cols: string) => `SELECT ${cols}
FROM gold_customer_metrics            -- one row per customer (~3,000)
${where(slicerPredicates(f))}`;

// ---------------------------------------------------------------------------------------------

const MONTHLY: LineageTable = { name: 'gold_customer_monthly', role: 'Fact', grain: 'customer × month' };
const METRICS: LineageTable = { name: 'gold_customer_metrics', role: 'Aggregate', grain: 'customer (snapshot, TTM to 28 Sep 2026)' };
const SLICER_DIMS = (table: string) => ({ column: 'customer_type, region, state, city, account_manager, churn_risk_band, lifecycle_stage, product_lines_bought, is_pro_member', table, use: 'filter (page slicers)' });
const KPI_TOTALS_NOTE = 'One query returns all six period totals; the Net sales, Return rate and Marketing engagement tiles share it.';
const METRICS_NOTE = 'One row-level query on gold_customer_metrics feeds the Revenue at risk, Upsell and Product lines tiles, the churn × upsell matrix, SKU diversification and Priority customers. It reruns only when a slicer changes, not the period.';

export const VISUALS: VisualLineage[] = [
  {
    id: 'kpi-sales', title: 'Net sales', group: 'KPI tiles', render: 'KPI tile', mark: 'one number for the whole selection', timing: 'period',
    tables: [MONTHLY],
    dimensions: [{ column: 'month', table: MONTHLY.name, use: 'filter (period, and the previous period)' }, SLICER_DIMS(MONTHLY.name)],
    measures: [{ name: 'Net sales', expr: 'SUM(net_sales)', table: MONTHLY.name }, { name: 'Change', expr: 'current ÷ previous period − 1', table: 'browser' }],
    slicers: 'All slicers + period', sql: kpiTotalsSql,
    browser: ['Divide the two totals for the "vs. previous period" change (skipped when the previous period predates the data)'],
    encoding: [['value', 'net_sales ($)'], ['detail', 'change vs. previous period']],
    notes: [KPI_TOTALS_NOTE, 'net_sales is the order subtotal (before tax), dated by order month.'],
  },
  {
    id: 'kpi-returns', title: 'Return rate', group: 'KPI tiles', render: 'KPI tile', mark: 'one ratio for the whole selection', timing: 'period',
    tables: [MONTHLY],
    dimensions: [{ column: 'month', table: MONTHLY.name, use: 'filter (period)' }, SLICER_DIMS(MONTHLY.name)],
    measures: [{ name: 'Returns', expr: 'SUM(returns_amount)', table: MONTHLY.name }, { name: 'Return rate', expr: 'SUM(returns_amount) ÷ SUM(net_sales)', table: 'browser' }],
    slicers: 'All slicers + period', sql: (f) => `${totalsSql(f, f.range)};`,
    browser: ['Return rate = returns ÷ net_sales'],
    encoding: [['value', 'return rate (%)'], ['detail', 'returns ($ refunded)']],
    notes: [KPI_TOTALS_NOTE, 'Returns are dated by the month refunded, so a return can land in a later period than its sale.'],
  },
  {
    id: 'kpi-engagement', title: 'Marketing engagement', group: 'KPI tiles', render: 'KPI tile', mark: 'one ratio for the whole selection', timing: 'period',
    tables: [MONTHLY],
    dimensions: [{ column: 'month', table: MONTHLY.name, use: 'filter (period)' }, SLICER_DIMS(MONTHLY.name)],
    measures: [
      { name: 'Touches', expr: 'SUM(marketing_touches)  -- campaign email / SMS received', table: MONTHLY.name },
      { name: 'Engagements', expr: 'SUM(marketing_engagements)  -- opened / clicked email, clicked SMS', table: MONTHLY.name },
      { name: 'Engagement rate', expr: 'engagements ÷ touches', table: 'browser' },
      { name: 'Support tickets', expr: 'SUM(tickets)', table: MONTHLY.name },
    ],
    slicers: 'All slicers + period', sql: (f) => `${totalsSql(f, f.range)};`,
    browser: ['Engagement rate = engagements ÷ touches'],
    encoding: [['value', 'engagement rate (%)'], ['detail', 'support tickets']],
    notes: [KPI_TOTALS_NOTE, 'Only campaign events count (flows and site activity are excluded).'],
  },
  {
    id: 'kpi-risk', title: 'Revenue at risk', group: 'KPI tiles', render: 'KPI tile', mark: 'one number for the whole selection', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [{ column: 'churn_risk_band', table: METRICS.name, use: 'count where High' }, SLICER_DIMS(METRICS.name)],
    measures: [
      { name: 'Revenue at risk', expr: 'SUM(revenue_at_risk)', table: 'browser' },
      { name: '', expr: 'revenue_at_risk = net_sales_ttm × churn_risk_score ÷ 100  (per customer, in the notebook)', table: METRICS.name },
      { name: 'High-risk customers', expr: "COUNT(*) WHERE churn_risk_band = 'High'  (score ≥ 60)", table: 'browser' },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, revenue_at_risk, churn_risk_band, … (39 columns)')};`,
    browser: ['Sum revenue_at_risk over the returned customers', "Count customers whose band is 'High'"],
    encoding: [['value', 'revenue at risk ($)'], ['detail', 'high-risk customer count']],
    notes: [METRICS_NOTE],
  },
  {
    id: 'kpi-upsell', title: 'Upsell opportunity', group: 'KPI tiles', render: 'KPI tile', mark: 'one number for the whole selection', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [SLICER_DIMS(METRICS.name)],
    measures: [
      { name: 'Upsell opportunity', expr: 'SUM(upsell_value_est)', table: 'browser' },
      { name: '', expr: "upsell_value_est = sum of the customer's top 3 product-line recommendations (see Scores)", table: METRICS.name },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, upsell_value_est, … (39 columns)')};`,
    browser: ['Sum upsell_value_est over the returned customers'],
    encoding: [['value', 'estimated annual upsell ($)']],
    notes: [METRICS_NOTE],
  },
  {
    id: 'kpi-lines', title: 'Product lines / customer', group: 'KPI tiles', render: 'KPI tile', mark: 'one average for the whole selection', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [{ column: 'orders_ttm', table: METRICS.name, use: 'filter: active = ordered in last 12 months' }, SLICER_DIMS(METRICS.name)],
    measures: [
      { name: 'Lines per customer', expr: 'AVG(product_lines_ttm) WHERE orders_ttm > 0', table: 'browser' },
      { name: 'Active customers', expr: 'COUNT(*) WHERE orders_ttm > 0', table: 'browser' },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, product_lines_ttm, orders_ttm, … (39 columns)')};`,
    browser: ['Keep customers with orders_ttm > 0', 'Average product_lines_ttm (distinct product lines bought in 12 months, of 9)'],
    encoding: [['value', 'average lines (1 decimal)'], ['detail', 'active customer count']],
    notes: [METRICS_NOTE],
  },
  {
    id: 'map', title: 'Customer map', group: 'Charts', render: 'Custom SVG map (d3-geo Albers USA + us-atlas state outlines)', mark: 'one bubble per city', timing: 'both',
    tables: [MONTHLY, METRICS],
    dimensions: [
      { column: 'city, state', table: 'both', use: 'group by (bubble)' },
      { column: 'latitude, longitude', table: METRICS.name, use: 'group by → bubble position' },
      { column: 'month', table: MONTHLY.name, use: 'filter (period)' },
      { column: 'churn_risk_band', table: METRICS.name, use: "filter = 'High' (high-risk count)" },
      SLICER_DIMS('both'),
    ],
    measures: [
      { name: 'Net sales · Orders · Returns · Tickets', expr: 'SUM(net_sales), SUM(orders), SUM(returns_amount), SUM(tickets)', table: MONTHLY.name },
      { name: 'Return rate · Engagement rate', expr: 'returns ÷ net_sales · engagements ÷ touches', table: 'browser' },
      { name: 'Customers', expr: 'COUNT(churn_risk_score)', table: METRICS.name },
      { name: 'Revenue at risk · Upsell', expr: 'SUM(revenue_at_risk) · SUM(upsell_value_est)', table: METRICS.name },
      { name: 'Average churn risk', expr: 'AVG(churn_risk_score)', table: METRICS.name },
      { name: 'High-risk customers', expr: "COUNT(churn_risk_score) WHERE churn_risk_band = 'High'", table: METRICS.name },
    ],
    slicers: "All slicers + period, except the map's own city selection (so every city stays drawn)",
    sql: (f) => {
      const m: Filters = { ...f, cities: [] };
      return `-- 1. period figures by city
SELECT city, state, SUM(net_sales), SUM(returns_amount), SUM(orders),
       SUM(marketing_touches), SUM(marketing_engagements), SUM(tickets)
FROM gold_customer_monthly
${where([...slicerPredicates(m), period(m.range)])}
GROUP BY city, state;

-- 2. snapshot figures and coordinates by city
SELECT city, state, latitude, longitude, COUNT(churn_risk_score) AS customers,
       SUM(revenue_at_risk), AVG(churn_risk_score), SUM(upsell_value_est)
FROM gold_customer_metrics
${where(slicerPredicates(m))}
GROUP BY city, state, latitude, longitude;

-- 3. high-risk customers by city
SELECT city, state, COUNT(churn_risk_score) AS high_risk
FROM gold_customer_metrics
${where([...slicerPredicates(m), "churn_risk_band = 'High'"])}
GROUP BY city, state;`;
    },
    browser: [
      'Join the three results on "City|ST"',
      'Project latitude / longitude to screen x, y (Albers USA)',
      'Bubble radius ∝ √(value ÷ largest city); colour ramps light → dark plum with the value',
      'Clicking, lassoing or boxing cities sets the page city slicer',
    ],
    encoding: [['position', 'longitude, latitude'], ['size', 'selected metric'], ['colour', 'selected metric'], ['outline', 'selected city']],
    notes: ['The metric picker switches between the 6 period and 5 snapshot figures without a new query.'],
  },
  {
    id: 'matrix', title: 'Churn risk × upsell opportunity', group: 'Charts', render: 'Vega-Lite scatter (circle marks)', mark: 'one dot per customer', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [{ column: 'unified_customer_id, customer_name', table: METRICS.name, use: 'one mark each; click opens the customer' }, { column: 'customer_type', table: METRICS.name, use: 'colour' }, SLICER_DIMS(METRICS.name)],
    measures: [
      { name: 'x', expr: 'churn_risk_score (0–100)', table: METRICS.name },
      { name: 'y', expr: 'upsell_score (0–100, percentile within type)', table: METRICS.name },
      { name: 'size', expr: 'net_sales_ttm', table: METRICS.name },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, customer_name, customer_type,\n       churn_risk_score, upsell_score, net_sales_ttm, … (39 columns)')};`,
    browser: ['No aggregation: each row becomes a dot', 'Reference rules at 50 on both axes split the four quadrants (Protect & expand, Grow, Save, Maintain)'],
    encoding: [['x', 'churn_risk_score'], ['y', 'upsell_score'], ['size', 'net_sales_ttm'], ['colour', 'customer_type'], ['tooltip', 'name, type, scores, sales']],
    notes: [METRICS_NOTE],
  },
  {
    id: 'breadth', title: 'SKU diversification', group: 'Charts', render: 'Vega-Lite bar chart', mark: 'one bar per number of product lines (1–9)', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [{ column: 'product_lines_ttm', table: METRICS.name, use: 'x axis (bucket 1–9)' }, { column: 'orders_ttm', table: METRICS.name, use: 'filter: > 0 (active)' }, SLICER_DIMS(METRICS.name)],
    measures: [
      { name: 'Customers', expr: 'COUNT(*) GROUP BY product_lines_ttm', table: 'browser' },
      { name: 'Narrative averages', expr: 'AVG(net_sales_ttm) for 4+ lines vs. ≤ 2 lines', table: 'browser' },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, product_lines_ttm, orders_ttm, net_sales_ttm, … (39 columns)')};`,
    browser: ['Keep active customers (orders_ttm > 0)', 'Count customers per product_lines_ttm value 1…9', 'Share buying 1–2 lines, and average sales for 4+ vs. ≤ 2 lines, for the sentence below the chart'],
    encoding: [['x', 'product lines bought (1–9)'], ['y', 'customers'], ['label', 'customers']],
    notes: [METRICS_NOTE],
  },
  {
    id: 'trend', title: 'Net sales and returns', group: 'Charts', render: 'Two Vega-Lite charts: line (sales) over bars (returns)', mark: 'one point / bar per month', timing: 'period',
    tables: [MONTHLY],
    dimensions: [{ column: 'month', table: MONTHLY.name, use: 'group by → x axis; filter (period)' }, SLICER_DIMS(MONTHLY.name)],
    measures: [
      { name: 'Net sales', expr: 'SUM(net_sales)', table: MONTHLY.name },
      { name: 'Returns', expr: 'SUM(returns_amount)', table: MONTHLY.name },
      { name: 'Return rate (tooltip)', expr: 'returns ÷ net_sales per month', table: 'browser' },
    ],
    slicers: 'All slicers + period',
    sql: (f) => `SELECT month, SUM(net_sales), SUM(returns_amount),
       SUM(marketing_touches), SUM(marketing_engagements), SUM(tickets)
FROM gold_customer_monthly
${where([...slicerPredicates(f), period(f.range)])}
GROUP BY month;`,
    browser: ['Sort by month', 'Return rate per month for the tooltip'],
    encoding: [['x', 'month'], ['y (line)', 'net sales'], ['y (bars)', 'returns'], ['tooltip', 'month, returns, return rate']],
    notes: ['Returns get their own y-scale so small amounts stay readable.'],
  },
  {
    id: 'penetration', title: 'Product line penetration', group: 'Charts', render: 'Vega-Lite grouped horizontal bars', mark: 'one bar per product line × customer type', timing: 'snapshot',
    tables: [{ name: 'gold_product_line_penetration', role: 'Aggregate', grain: 'customer type × product line (18 rows)' }],
    dimensions: [
      { column: 'product_line', table: 'gold_product_line_penetration', use: 'y axis; click picks the SKU explorer line' },
      { column: 'customer_type', table: 'gold_product_line_penetration', use: 'colour / bar offset; customer-type slicer' },
    ],
    measures: [
      { name: 'Penetration', expr: 'pre-computed: active customers who bought the line in 12 months ÷ all active customers', table: 'gold_product_line_penetration' },
    ],
    slicers: 'Customer type only (applied in the browser); other slicers do not apply because the table is pre-aggregated',
    sql: () => `SELECT customer_type, product_line, penetration, active_customers, avg_spend_per_buyer
FROM gold_product_line_penetration;   -- whole table, no filters`,
    browser: ['Keep rows for the selected customer type (or both)'],
    encoding: [['y', 'product_line (sorted by penetration)'], ['x', 'penetration (0–100%)'], ['colour', 'customer_type']],
    notes: ['Active = placed an order in the 365 days to 28 Sep 2026. Built in the notebook by cross-joining active customers with every product line.'],
  },
  {
    id: 'sku-chart', title: 'SKU explorer: top SKUs', group: 'SKU explorer', render: 'Vega-Lite horizontal bar chart (+ 4 KPI tiles when a SKU is selected)', mark: 'one bar per SKU (top 15 by sales)', timing: 'snapshot',
    tables: [{ name: 'gold_sku_performance', role: 'Aggregate', grain: 'SKU × customer type' }],
    dimensions: [
      { column: 'sku, product_name', table: 'gold_sku_performance', use: 'y axis (one bar each)' },
      { column: 'product_line', table: 'gold_sku_performance', use: 'filter (line picker / penetration click)' },
      { column: 'customer_type', table: 'gold_sku_performance', use: 'filter (customer-type slicer); summed away otherwise' },
    ],
    measures: [
      { name: 'Net sales', expr: 'SUM(net_sales_ttm) across the selected types', table: 'browser' },
      { name: 'Return rate', expr: 'SUM(returns_ttm) ÷ SUM(net_sales_ttm)', table: 'browser' },
      { name: 'Linked tickets · Buyers · Units', expr: 'SUM(tickets_linked_ttm) · SUM(buyers_ttm) · SUM(units_ttm)', table: 'browser' },
      { name: 'YoY', expr: 'net_sales_ttm ÷ net_sales_prior_ttm − 1', table: 'browser' },
    ],
    slicers: 'Customer type only (in the browser)',
    sql: () => `SELECT sku, product_name, product_line, category, customer_type,
       net_sales_ttm, net_sales_prior_ttm, returns_ttm, defect_returns_ttm,
       units_ttm, buyers_ttm, tickets_linked_ttm, return_rate_ttm, sales_yoy, repeat_buyer_rate
FROM gold_sku_performance;   -- whole table, fetched once`,
    browser: ['Keep the selected customer type', 'Add the Wholesale and Direct rows together per SKU', 'Keep the selected product line', 'Sort by net sales, top 15'],
    encoding: [['y', 'product name'], ['x', 'net sales (12 mo)'], ['opacity', 'selected SKU'], ['tooltip', 'SKU, sales, return rate, tickets']],
    notes: ['Linked tickets = support tickets in 12 months that cite an order containing the SKU.'],
  },
  {
    id: 'sku-watch', title: 'SKU explorer: SKUs to watch', group: 'SKU explorer', render: 'HTML table', mark: 'one row per SKU (top 10)', timing: 'snapshot',
    tables: [{ name: 'gold_sku_performance', role: 'Aggregate', grain: 'SKU × customer type' }],
    dimensions: [{ column: 'sku, product_name', table: 'gold_sku_performance', use: 'row' }, { column: 'product_line, customer_type', table: 'gold_sku_performance', use: 'filter' }],
    measures: [
      { name: 'Watch score', expr: 'returns ÷ sales + linked tickets ÷ buyers', table: 'browser' },
      { name: 'Sales · YoY · Return rate · Tickets', expr: 'as in Top SKUs', table: 'browser' },
    ],
    slicers: 'Customer type only (in the browser)',
    sql: () => 'SELECT … FROM gold_sku_performance;   -- same result as Top SKUs, no second query',
    browser: ['Same per-SKU totals as Top SKUs', 'Rank by return rate + tickets per buyer, top 10'],
    encoding: [['rows', 'SKU'], ['columns', 'sales, YoY, return rate, tickets']],
  },
  {
    id: 'sku-buyers', title: 'SKU explorer: top buyers', group: 'SKU explorer', render: 'List', mark: 'one row per customer (top 8)', timing: 'snapshot',
    tables: [{ name: 'gold_customer_sku', role: 'Fact', grain: 'customer × SKU (24 months)' }, METRICS],
    dimensions: [
      { column: 'sku', table: 'gold_customer_sku', use: 'filter = selected SKU' },
      { column: 'customer_type, region, account_manager', table: 'gold_customer_sku', use: 'filter (slicers)' },
      { column: 'unified_customer_id', table: 'both', use: 'join key for the risk badge' },
    ],
    measures: [
      { name: 'Net sales (12 mo)', expr: 'net_sales_ttm (per customer, already summed)', table: 'gold_customer_sku' },
      { name: 'Lapsed buyers', expr: 'COUNT(*) WHERE net_sales_ttm = 0 AND net_sales_prior_ttm > 0', table: 'browser' },
      { name: 'Risk badge', expr: 'churn_risk_band', table: METRICS.name },
    ],
    slicers: 'Customer type, region, account owner (the table does not carry the other slicer columns)',
    sql: (f) => `SELECT unified_customer_id, customer_type, customer_name, region, account_manager,
       net_sales_ttm, net_sales_prior_ttm, units_ttm, returns_ttm, last_purchased
FROM gold_customer_sku
${where([...slicerPredicates(f, 'basic'), "sku = '<selected SKU>'"])};`,
    browser: ['Keep buyers with net_sales_ttm > 0, sort, top 8', 'Look up each buyer in the already-loaded customer metrics for the churn badge', 'Count lapsed buyers for the note'],
    encoding: [['row', 'customer name'], ['value', 'net sales (12 mo)'], ['badge', 'churn risk band']],
  },
  {
    id: 'sku-affinity', title: 'SKU explorer: bought together', group: 'SKU explorer', render: 'List', mark: 'one row per related SKU (top 6)', timing: 'snapshot',
    tables: [{ name: 'gold_sku_affinity', role: 'Aggregate', grain: 'SKU pair × customer type (top 5 per SKU)' }],
    dimensions: [{ column: 'sku', table: 'gold_sku_affinity', use: 'filter = selected SKU' }, { column: 'related_sku, related_product_name', table: 'gold_sku_affinity', use: 'row' }, { column: 'customer_type', table: 'gold_sku_affinity', use: 'filter (browser)' }],
    measures: [
      { name: 'Confidence', expr: 'customers buying both ÷ customers buying this SKU', table: 'gold_sku_affinity' },
      { name: 'Lift', expr: "confidence ÷ share of all customers buying the related SKU", table: 'gold_sku_affinity' },
    ],
    slicers: 'Customer type only (in the browser)',
    sql: () => `SELECT customer_type, rank, related_sku, related_product_name, related_product_line,
       pair_customers, confidence, lift
FROM gold_sku_affinity
WHERE sku = '<selected SKU>';`,
    browser: ['Keep the selected customer type', 'Sort by lift × confidence, top 6'],
    encoding: [['row', 'related product'], ['detail', 'confidence %, lift']],
    notes: ['Pairs need at least 3 shared customers; baskets are 12-month purchases per customer.'],
  },
  {
    id: 'priority', title: 'Priority customers', group: 'Tables', render: 'HTML table', mark: 'one row per customer (top 15)', timing: 'snapshot',
    tables: [METRICS],
    dimensions: [
      { column: 'customer_name, customer_type, region, account_manager', table: METRICS.name, use: 'row labels' },
      { column: 'churn_risk_band, top_churn_driver, next_best_action', table: METRICS.name, use: 'shown as text / badge' },
      SLICER_DIMS(METRICS.name),
    ],
    measures: [
      { name: 'Rank', expr: 'priority_score = revenue_at_risk × 0.6 + upsell_value_est × 2', table: METRICS.name },
      { name: 'Columns', expr: 'net_sales_ttm, sales_yoy, product_lines_ttm, return_rate_ttm, open_tickets, high_priority_open, churn_risk_score, upsell_score, upsell_value_est', table: METRICS.name },
    ],
    slicers: 'All slicers (not the period)', sql: (f) => `${METRICS_SQL(f, 'unified_customer_id, customer_name, priority_score, … (39 columns)')};`,
    browser: ['Sort by priority_score, top 15', 'No aggregation: each column is a stored per-customer value'],
    encoding: [['rows', 'customer'], ['badge', 'churn risk band + score'], ['meter', 'upsell_score']],
    notes: [METRICS_NOTE],
  },
];

export const VISUAL_BY_ID = new Map(VISUALS.map((v) => [v.id, v]));
