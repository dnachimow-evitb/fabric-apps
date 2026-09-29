// Data access for the Customer 360 app. Every read goes through the typed Lakehouse connector
// (client.connectors.c360lakehouse.<Entity>) over the gold_* tables built by the Fabric notebooks.
import { getRayfinClient } from './rayfin-client';

export type CustomerType = 'Wholesale' | 'Direct';

export interface Filters {
  customerType: CustomerType | 'all';
  region: string | 'all';
  owner: string | 'all';
}

export const ALL_FILTERS: Filters = { customerType: 'all', region: 'all', owner: 'all' };

async function lake() {
  const client = await getRayfinClient();
  return client.connectors.c360lakehouse;
}

type Eq = { eq: string };

/** Connector `where` clause for the shared page filters. */
function filterWhere(f: Filters) {
  const w: { customerType?: Eq; region?: Eq; accountManager?: Eq } = {};
  if (f.customerType !== 'all') w.customerType = { eq: f.customerType };
  if (f.region !== 'all') w.region = { eq: f.region };
  if (f.owner !== 'all') w.accountManager = { eq: f.owner };
  return w;
}

const METRIC_FIELDS = [
  'unifiedCustomerId', 'customerType', 'customerName', 'region', 'accountManager', 'isProMember',
  'netSalesTtm', 'netSalesPriorTtm', 'salesYoy', 'ordersTtm', 'lastOrderDate', 'daysSinceOrder',
  'returnsTtm', 'returnRateTtm', 'productLinesTtm', 'tickets12m', 'openTickets', 'highPriorityOpen',
  'badCsat12m', 'avgResolutionMinutes12m', 'engagementRate90d', 'engagementRatePrior', 'daysSinceEngaged',
  'churnRiskScore', 'churnRiskBand', 'topChurnDriver', 'churnDrivers', 'upsellScore', 'upsellValueEst',
  'topUpsellProductLine', 'revenueAtRisk', 'priorityScore', 'nextBestAction',
] as const;

/** One row per Wholesale / Direct customer (about 3,000 rows: fetched in a single page). */
export async function fetchMetrics(f: Filters) {
  const l = await lake();
  return l.GoldCustomerMetrics.select([...METRIC_FIELDS]).where(filterWhere(f)).first(10000).execute();
}
export type MetricRow = Awaited<ReturnType<typeof fetchMetrics>>[number];

/** Portfolio trend: monthly totals aggregated server-side under the page filters. */
export async function fetchMonthlyTrend(f: Filters) {
  const l = await lake();
  const rows = await l.GoldCustomerMonthly.where(filterWhere(f))
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
