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
  ]).where({ ...filterWhere(f), sku: { eq: sku } }).first(5000).execute();
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
  ]).where(filterWhere(f)).first(10000).execute();
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
