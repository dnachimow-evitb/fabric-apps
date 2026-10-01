// Data access for the Customer 360 app. Every read goes through the typed Lakehouse connector
// (client.connectors.c360lakehouse.<Entity>) over the gold_* tables built by the Fabric notebooks.
import { getRayfinClient } from './rayfin-client';

export type CustomerType = 'Wholesale' | 'Direct';

// ---------------------------------------------------------------------------------------------
// Date range (month precision: sales, returns, marketing and tickets are stored per customer-month)

/** First and last month of the data (as of 2026-09-28). */
export const FIRST_MONTH = '2024-10';
export const LAST_MONTH = '2026-09';

export const DATE_PRESETS = [
  { id: 'last3', label: 'Last 3 months' },
  { id: 'last6', label: 'Last 6 months' },
  { id: 'last12', label: 'Last 12 months' },
  { id: 'ytd', label: 'Year to date (2026)' },
  { id: 'thisQ', label: 'This quarter (Q3 2026)' },
  { id: 'lastQ', label: 'Last quarter (Q2 2026)' },
  { id: 'cal2025', label: 'Calendar 2025' },
  { id: 'prior12', label: 'Prior 12 months' },
  { id: 'all', label: 'All data (24 months)' },
  { id: 'custom', label: 'Custom range' },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]['id'];

export interface DateRange { preset: DatePreset; from: string; to: string }

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export function presetRange(preset: DatePreset, custom?: { from: string; to: string }): DateRange {
  const r = (from: string, to: string): DateRange => ({ preset, from, to });
  switch (preset) {
    case 'last3': return r(addMonths(LAST_MONTH, -2), LAST_MONTH);
    case 'last6': return r(addMonths(LAST_MONTH, -5), LAST_MONTH);
    case 'ytd': return r('2026-01', LAST_MONTH);
    case 'thisQ': return r('2026-07', '2026-09');
    case 'lastQ': return r('2026-04', '2026-06');
    case 'cal2025': return r('2025-01', '2025-12');
    case 'prior12': return r(addMonths(LAST_MONTH, -23), addMonths(LAST_MONTH, -12));
    case 'all': return r(FIRST_MONTH, LAST_MONTH);
    case 'custom': {
      const from = custom?.from && custom.from >= FIRST_MONTH ? custom.from : addMonths(LAST_MONTH, -11);
      const to = custom?.to && custom.to <= LAST_MONTH ? custom.to : LAST_MONTH;
      return from <= to ? r(from, to) : r(to, from);
    }
    default: return r(addMonths(LAST_MONTH, -11), LAST_MONTH);
  }
}

/** The equal-length period immediately before a range, or null when it would start before the data. */
export function previousRange(range: DateRange): { from: string; to: string } | null {
  const n = monthsBetween(range.from, range.to);
  const from = addMonths(range.from, -n);
  return from < FIRST_MONTH ? null : { from, to: addMonths(range.from, -1) };
}

export function rangeLabel(range: { from: string; to: string }): string {
  const f = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return range.from === range.to ? f(range.from) : `${f(range.from)} – ${f(range.to)}`;
}

// ---------------------------------------------------------------------------------------------
// Page filters (slicers). All of them are applied server-side, on both customer and monthly tables.

export const RISK_BANDS = ['High', 'Medium', 'Low'] as const;
export const LIFECYCLE_STAGES = ['New', 'Active', 'At Risk', 'Lapsed'] as const;

export interface Filters {
  customerType: CustomerType | 'all';
  region: string | 'all';
  /** Multi-select; empty = all states. */
  states: string[];
  /** Cities picked on the map, as "City|ST" keys; empty = all cities. */
  cities: string[];
  owner: string | 'all';
  riskBand: string | 'all';
  lifecycle: string | 'all';
  productLine: string | 'all';
  proOnly: boolean;
  range: DateRange;
}

export const ALL_FILTERS: Filters = {
  customerType: 'all', region: 'all', states: [], cities: [], owner: 'all', riskBand: 'all', lifecycle: 'all', productLine: 'all',
  proOnly: false, range: presetRange('last12'),
};

/** Only the customer-attribute slicers (not the date range): used for snapshot tables and cache keys. */
export function slicerKey(f: Filters): string {
  const rest: Partial<Filters> = { ...f };
  delete rest.range;
  return JSON.stringify(rest);
}

async function lake() {
  const client = await getRayfinClient();
  return client.connectors.c360lakehouse;
}

type Eq<T = string> = { eq: T };

/** Connector `where` clause for the customer-attribute slicers (same column names on metrics and monthly). */
function filterWhere(f: Filters) {
  const w: {
    customerType?: Eq; region?: Eq; state?: { in: string[] }; city?: { in: string[] }; accountManager?: Eq; churnRiskBand?: Eq; lifecycleStage?: Eq;
    productLinesBought?: { contains: string }; isProMember?: Eq<boolean>;
  } = {};
  if (f.customerType !== 'all') w.customerType = { eq: f.customerType };
  if (f.region !== 'all') w.region = { eq: f.region };
  if (f.states.length) w.state = { in: f.states };
  if (f.cities.length) w.city = { in: [...new Set(f.cities.map(cityName))] };
  if (f.owner !== 'all') w.accountManager = { eq: f.owner };
  if (f.riskBand !== 'all') w.churnRiskBand = { eq: f.riskBand };
  if (f.lifecycle !== 'all') w.lifecycleStage = { eq: f.lifecycle };
  if (f.productLine !== 'all') w.productLinesBought = { contains: `|${f.productLine}|` };
  if (f.proOnly) w.isProMember = { eq: true };
  return w;
}

export const cityKey = (city: string, state: string) => `${city}|${state}`;
export const cityName = (key: string) => key.split('|')[0];
export const cityLabel = (key: string) => key.split('|').join(', ');

/** Type / region / owner only: for tables that do not carry the other slicer columns (SKU buyers, cascades). */
function basicWhere(f: Filters) {
  const w: { customerType?: Eq; region?: Eq; accountManager?: Eq } = {};
  if (f.customerType !== 'all') w.customerType = { eq: f.customerType };
  if (f.region !== 'all') w.region = { eq: f.region };
  if (f.owner !== 'all') w.accountManager = { eq: f.owner };
  return w;
}

/** Slicers plus a month range on the monthly fact table. */
function monthlyWhere(f: Filters, range: { from: string; to: string }) {
  return { ...filterWhere(f), month: { gte: new Date(`${range.from}-01T00:00:00Z`), lte: new Date(`${range.to}-01T00:00:00Z`) } };
}

const METRIC_FIELDS = [
  'unifiedCustomerId', 'customerType', 'customerName', 'region', 'accountManager', 'isProMember',
  'netSalesTtm', 'netSalesPriorTtm', 'salesYoy', 'ordersTtm', 'lastOrderDate', 'daysSinceOrder',
  'returnsTtm', 'returnRateTtm', 'productLinesTtm', 'tickets12m', 'openTickets', 'highPriorityOpen',
  'badCsat12m', 'avgResolutionMinutes12m', 'engagementRate90d', 'engagementRatePrior', 'daysSinceEngaged',
  'churnRiskScore', 'churnRiskBand', 'topChurnDriver', 'churnDrivers', 'upsellScore', 'upsellValueEst',
  'topUpsellProductLine', 'revenueAtRisk', 'priorityScore', 'nextBestAction',
  'city', 'state', 'latitude', 'longitude', 'lifecycleStage', 'productLinesBought',
] as const;

/** One row per Wholesale / Direct customer (about 3,000 rows: fetched in a single page). */
export async function fetchMetrics(f: Filters) {
  const l = await lake();
  return l.GoldCustomerMetrics.select([...METRIC_FIELDS]).where(filterWhere(f)).first(10000).execute();
}
export type MetricRow = Awaited<ReturnType<typeof fetchMetrics>>[number];

const RANGE_AGGREGATES = {
  netSales: { sum: 'netSales' },
  returns: { sum: 'returnsAmount' },
  orders: { sum: 'orders' },
  touches: { sum: 'marketingTouches' },
  engagements: { sum: 'marketingEngagements' },
  tickets: { sum: 'tickets' },
} as const;

type Agg = { netSales?: number | null; returns?: number | null; orders?: number | null; touches?: number | null; engagements?: number | null; tickets?: number | null };
const totals = (a: Agg) => ({
  netSales: a.netSales ?? 0, returns: a.returns ?? 0, orders: a.orders ?? 0,
  touches: a.touches ?? 0, engagements: a.engagements ?? 0, tickets: a.tickets ?? 0,
});
export type RangeTotals = ReturnType<typeof totals>;

/** Grand totals for a month range under the slicers (one aggregated row, computed server-side). */
export async function fetchRangeTotals(f: Filters, range: { from: string; to: string }) {
  const l = await lake();
  const rows = await l.GoldCustomerMonthly.where(monthlyWhere(f, range)).aggregate(RANGE_AGGREGATES).execute();
  return totals(rows[0]?.aggregations ?? {});
}

/** Range totals by city (at most ~20 groups), for the map. */
export async function fetchRangeByCity(f: Filters, range: { from: string; to: string }) {
  const l = await lake();
  const rows = await l.GoldCustomerMonthly.where(monthlyWhere(f, range)).groupBy(['city', 'state']).aggregate(RANGE_AGGREGATES).execute();
  return rows.map((r) => ({ city: r.fields.city ?? '', state: r.fields.state ?? '', ...totals(r.aggregations) }));
}
export type CityTotals = Awaited<ReturnType<typeof fetchRangeByCity>>[number];

/** Current-snapshot figures by city for the map (server-side aggregates on the customer metrics table). */
export async function fetchMapSnapshot(f: Filters) {
  const l = await lake();
  const where = filterWhere(f);
  const [all, high] = await Promise.all([
    l.GoldCustomerMetrics.where(where).groupBy(['city', 'state', 'latitude', 'longitude']).aggregate({
      customers: { count: 'churnRiskScore' }, risk: { sum: 'revenueAtRisk' }, churn: { avg: 'churnRiskScore' }, upsell: { sum: 'upsellValueEst' },
    }).execute(),
    l.GoldCustomerMetrics.where({ ...where, churnRiskBand: { eq: 'High' } }).groupBy(['city', 'state']).aggregate({
      highRisk: { count: 'churnRiskScore' },
    }).execute(),
  ]);
  const highBy = new Map(high.map((r) => [cityKey(r.fields.city ?? '', r.fields.state ?? ''), r.aggregations.highRisk ?? 0]));
  return all.filter((r) => r.fields.city && r.fields.latitude != null && r.fields.longitude != null).map((r) => {
    const key = cityKey(r.fields.city ?? '', r.fields.state ?? '');
    return {
      key, city: r.fields.city ?? '', state: r.fields.state ?? '', lat: Number(r.fields.latitude), lon: Number(r.fields.longitude),
      customers: r.aggregations.customers ?? 0, risk: r.aggregations.risk ?? 0, churn: r.aggregations.churn ?? 0,
      upsell: r.aggregations.upsell ?? 0, highRisk: highBy.get(key) ?? 0,
    };
  });
}
export type CitySnapshot = Awaited<ReturnType<typeof fetchMapSnapshot>>[number];

/** Portfolio trend: monthly totals for the selected range, aggregated server-side under the slicers. */
export async function fetchMonthlyTrend(f: Filters) {
  const l = await lake();
  const rows = await l.GoldCustomerMonthly.where(monthlyWhere(f, f.range))
    .groupBy(['month'])
    .aggregate({
      netSales: { sum: 'netSales' },
      returns: { sum: 'returnsAmount' },
      touches: { sum: 'marketingTouches' },
      engagements: { sum: 'marketingEngagements' },
      tickets: { sum: 'tickets' },
    })
    .execute();
  return rows
    .map((r) => ({
      month: toDate(r.fields.month),
      netSales: r.aggregations.netSales ?? 0,
      returns: r.aggregations.returns ?? 0,
      touches: r.aggregations.touches ?? 0,
      engagements: r.aggregations.engagements ?? 0,
      tickets: r.aggregations.tickets ?? 0,
    }))
    .sort((a, b) => a.month.getTime() - b.month.getTime());
}
export type TrendRow = Awaited<ReturnType<typeof fetchMonthlyTrend>>[number];

export async function fetchPenetration() {
  const l = await lake();
  return l.GoldProductLinePenetration.select(['customerType', 'productLine', 'penetration', 'activeCustomers', 'avgSpendPerBuyer'])
    .first(1000)
    .execute();
}
export type PenetrationRow = Awaited<ReturnType<typeof fetchPenetration>>[number];

// ---------------------------------------------------------------------------------------------
// Customer 360 (single customer)

const byCustomer = (id: string) => ({ unifiedCustomerId: { eq: id } });

export async function fetchCustomerProfile(id: string) {
  const l = await lake();
  return l.GoldDimCustomer.select([
    'unifiedCustomerId', 'customerType', 'customerName', 'primaryEmail', 'city', 'state', 'region', 'accountManager',
    'locationCount', 'paymentTerms', 'isProMember', 'customerSince', 'inErp', 'inShopify', 'inKlaviyo', 'inZendesk',
    'sourceSystemCount', 'erpCustomerNumber', 'shopifyCustomerId', 'klaviyoProfileCount', 'zendeskUserCount',
    'linkedSourceRecords', 'identityConfidence', 'emailMarketingConsent', 'smsMarketingConsent', 'firstOrderDate',
    'lastOrderDate', 'lifetimeOrders', 'lastEmailEngagementAt', 'lastSupportContactAt', 'activeChannels12m',
    'activeChannelCount12m', 'lifecycleStage',
  ]).where(byCustomer(id)).first(1).execute().then((r) => r[0] ?? null);
}
export type ProfileRow = NonNullable<Awaited<ReturnType<typeof fetchCustomerProfile>>>;

export async function fetchCustomerMonthly(id: string) {
  const l = await lake();
  const rows = await l.GoldCustomerMonthly.select([
    'month', 'netSales', 'orders', 'returnsAmount', 'returnsCount', 'marketingTouches', 'marketingEngagements', 'tickets',
  ]).where(byCustomer(id)).first(100).execute();
  return rows.map((r) => ({ ...r, month: toDate(r.month) })).sort((a, b) => a.month.getTime() - b.month.getTime());
}
export type CustomerMonthRow = Awaited<ReturnType<typeof fetchCustomerMonthly>>[number];

export async function fetchCustomerProductLines(id: string) {
  const l = await lake();
  return l.GoldCustomerProductLine.select([
    'productLine', 'netSalesTtm', 'shareOfSalesTtm', 'purchasedTtm', 'views90d', 'peerPenetration',
  ]).where(byCustomer(id)).first(50).execute();
}
export type ProductLineRow = Awaited<ReturnType<typeof fetchCustomerProductLines>>[number];

export async function fetchCustomerUpsell(id: string) {
  const l = await lake();
  const rows = await l.GoldCustomerUpsell.select(['rank', 'productLine', 'estimatedAnnualValue', 'peerPenetration', 'views90d', 'reason'])
    .where(byCustomer(id)).first(10).execute();
  return rows.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}
export type UpsellRow = Awaited<ReturnType<typeof fetchCustomerUpsell>>[number];

export async function fetchCustomerTimeline(id: string) {
  const l = await lake();
  const rows = await l.GoldCustomerTimeline.select(['eventAt', 'source', 'title', 'detail'])
    .where(byCustomer(id)).first(50).execute();
  return rows.map((r) => ({ ...r, eventAt: toDate(r.eventAt) })).sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
}
export type TimelineRow = Awaited<ReturnType<typeof fetchCustomerTimeline>>[number];

// ---------------------------------------------------------------------------------------------

export function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

export interface ChurnDriver { points: number; driver: string; detail: string }

export function parseDrivers(json: string | null | undefined): ChurnDriver[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ChurnDriver[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// SKU drill-down

export async function fetchSkuPerformance() {
  const l = await lake();
  return l.GoldSkuPerformance.select([
    'sku', 'productName', 'productLine', 'category', 'customerType', 'netSalesTtm', 'netSalesPriorTtm', 'returnsTtm',
    'defectReturnsTtm', 'unitsTtm', 'buyersTtm', 'ticketsLinkedTtm', 'returnRateTtm', 'salesYoy', 'repeatBuyerRate',
  ]).first(5000).execute();
}
export type SkuPerfRow = Awaited<ReturnType<typeof fetchSkuPerformance>>[number];

/** Customers who bought a SKU in the last 24 months, under the page filters. */
export async function fetchSkuBuyers(sku: string, f: Filters) {
  const l = await lake();
  return l.GoldCustomerSku.select([
    'unifiedCustomerId', 'customerType', 'customerName', 'region', 'accountManager', 'netSalesTtm', 'netSalesPriorTtm',
    'unitsTtm', 'returnsTtm', 'lastPurchased',
  ]).where({ ...basicWhere(f), sku: { eq: sku } }).first(5000).execute();
}
export type SkuBuyerRow = Awaited<ReturnType<typeof fetchSkuBuyers>>[number];

export async function fetchSkuAffinity(sku: string) {
  const l = await lake();
  return l.GoldSkuAffinity.select([
    'customerType', 'rank', 'relatedSku', 'relatedProductName', 'relatedProductLine', 'pairCustomers', 'confidence', 'lift',
  ]).where({ sku: { eq: sku } }).first(50).execute();
}
export type SkuAffinityRow = Awaited<ReturnType<typeof fetchSkuAffinity>>[number];

export async function fetchCustomerSkus(id: string) {
  const l = await lake();
  return l.GoldCustomerSku.select([
    'sku', 'productName', 'productLine', 'netSalesTtm', 'netSalesPriorTtm', 'unitsTtm', 'returnsTtm', 'lastPurchased',
  ]).where(byCustomer(id)).first(1000).execute();
}
export type CustomerSkuRow = Awaited<ReturnType<typeof fetchCustomerSkus>>[number];

export async function fetchCustomerSkuRecs(id: string) {
  const l = await lake();
  const rows = await l.GoldCustomerSkuRecs.select(['rank', 'sku', 'productName', 'productLine', 'score', 'estimatedAnnualValue', 'reason'])
    .where(byCustomer(id)).first(10).execute();
  return rows.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}
export type SkuRecRow = Awaited<ReturnType<typeof fetchCustomerSkuRecs>>[number];

// ---------------------------------------------------------------------------------------------
// Product line reports. Rows carry only type / region / owner, so the remaining slicers are applied
// in the browser by keeping customers present in the filtered metrics (see lib/product-line-report.ts).

/** Every customer × SKU row for one product line (bought in the last 24 months). */
export async function fetchLineSkuRows(line: string, f: Filters) {
  const l = await lake();
  return l.GoldCustomerSku.select([
    'unifiedCustomerId', 'customerType', 'sku', 'productName', 'netSalesTtm', 'netSalesPriorTtm', 'unitsTtm', 'returnsTtm',
  ]).where({ ...basicWhere(f), productLine: { eq: line } }).first(50000).execute();
}
export type LineSkuRow = Awaited<ReturnType<typeof fetchLineSkuRows>>[number];

/** Customers who don't buy the line yet, with the estimated annual value of winning them. */
export async function fetchLineUpsell(line: string) {
  const l = await lake();
  return l.GoldCustomerUpsell.select(['unifiedCustomerId', 'estimatedAnnualValue'])
    .where({ productLine: { eq: line } }).first(10000).execute();
}
export type LineUpsellRow = Awaited<ReturnType<typeof fetchLineUpsell>>[number];

// ---------------------------------------------------------------------------------------------
// Risk & correlation

export async function fetchIssueCascade() {
  const l = await lake();
  return l.GoldIssueCascade.select(['cohort', 'customerType', 'relMonth', 'customers', 'salesIndex', 'engagementRate', 'ticketsPerCustomer'])
    .first(1000).execute();
}
export type CascadeRow = Awaited<ReturnType<typeof fetchIssueCascade>>[number];

export async function fetchCustomerCascades(f: Filters) {
  const l = await lake();
  return l.GoldCustomerCascade.select([
    'unifiedCustomerId', 'customerType', 'customerName', 'region', 'accountManager', 'spikeMonth', 'ticketsInSpikeMonth',
    'engagementBefore', 'engagementAfter', 'monthlySalesBefore', 'monthlySalesAfter', 'engagementDropLag', 'salesDropLag', 'pattern',
  ]).where(basicWhere(f)).first(10000).execute();
}
export type CustomerCascadeRow = Awaited<ReturnType<typeof fetchCustomerCascades>>[number];

export async function fetchDriverCorrelation() {
  const l = await lake();
  return l.GoldDriverCorrelation.select([
    'driverKey', 'driver', 'customerType', 'correlation', 'n', 'salesChangeWhenHigh', 'salesChangeOtherwise', 'highDefinition',
  ]).first(200).execute();
}
export type DriverCorrRow = Awaited<ReturnType<typeof fetchDriverCorrelation>>[number];

export async function fetchRiskConcentration() {
  const l = await lake();
  return l.GoldRiskConcentration.select([
    'dimension', 'value', 'customerType', 'customers', 'highRiskCustomers', 'netSalesTtm', 'revenueAtRisk', 'shareOfRisk',
  ]).first(2000).execute();
}
export type ConcentrationRow = Awaited<ReturnType<typeof fetchRiskConcentration>>[number];

// ---------------------------------------------------------------------------------------------
// Identity merge candidates (read from the lakehouse)

export async function fetchMergeCandidates() {
  const l = await lake();
  return l.GoldIdentityMergeCandidates.select([
    'candidateId', 'primaryCustomerId', 'secondaryCustomerId', 'primaryCustomerType', 'secondaryCustomerType',
    'primaryCustomerName', 'secondaryCustomerName', 'primaryPrimaryEmail', 'secondaryPrimaryEmail', 'primaryCity',
    'secondaryCity', 'primaryState', 'secondaryState', 'primaryLifetimeOrders', 'secondaryLifetimeOrders',
    'primarySourceSystemCount', 'secondarySourceSystemCount', 'score', 'reasons',
  ]).first(2000).execute();
}
export type MergeCandidateRow = Awaited<ReturnType<typeof fetchMergeCandidates>>[number];

export async function fetchCustomerCascade(id: string) {
  const l = await lake();
  const rows = await l.GoldCustomerCascade.select([
    'spikeMonth', 'ticketsInSpikeMonth', 'engagementBefore', 'engagementAfter', 'monthlySalesBefore', 'monthlySalesAfter',
    'engagementDropLag', 'salesDropLag', 'pattern',
  ]).where(byCustomer(id)).first(1).execute();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Merge proposals (app-owned records in the app's SQL database)

export async function fetchMergeProposals() {
  const client = await getRayfinClient();
  return client.data.MergeProposal.select([
    'id', 'candidateId', 'primaryCustomerId', 'secondaryCustomerId', 'primaryName', 'secondaryName', 'matchScore', 'note',
    'proposedBy', 'proposedAt', 'status', 'reviewedBy', 'reviewedAt', 'reviewNote',
  ]).orderBy({ proposedAt: 'desc' }).first(1000).execute();
}
export type MergeProposalRow = Awaited<ReturnType<typeof fetchMergeProposals>>[number];

export async function proposeMerge(c: MergeCandidateRow, proposedBy: string, note: string) {
  const client = await getRayfinClient();
  return client.data.MergeProposal.create({
    id: crypto.randomUUID(),
    candidateId: c.candidateId ?? undefined,
    primaryCustomerId: c.primaryCustomerId ?? '',
    secondaryCustomerId: c.secondaryCustomerId ?? '',
    primaryName: c.primaryCustomerName ?? undefined,
    secondaryName: c.secondaryCustomerName ?? undefined,
    matchScore: c.score ?? undefined,
    note: note || undefined,
    proposedBy,
    proposedAt: new Date(),
  });
}

export async function reviewMerge(id: string, decision: 'Approved' | 'Rejected', reviewedBy: string, reviewNote: string) {
  const client = await getRayfinClient();
  return client.data.MergeProposal.update({ id }, { status: decision, reviewedBy, reviewedAt: new Date(), reviewNote: reviewNote || undefined });
}
