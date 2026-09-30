// Merge emulation: previews several unified customers as one identity, in the browser, before anyone proposes the
// merge. Facts are combined the way the Fabric rebuild would combine them (sums per month / product line / SKU, union
// of source systems and events), and churn risk is re-scored with the same rules as c360_customer_metrics.
// Nothing here is saved; a real merge still goes through a proposal and a data steward.
import type {
  ChurnDriver, CustomerMonthRow, CustomerSkuRow, MetricRow, ProductLineRow, ProfileRow, SkuRecRow, TimelineRow, UpsellRow,
} from './c360';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const sum = <T>(xs: T[], f: (x: T) => unknown) => xs.reduce((s, x) => s + n(f(x)), 0);
const minOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(Number(x))).map(Number);
  return v.length ? Math.min(...v) : null;
};
const earliest = (xs: unknown[]) => pickDate(xs, (a, b) => a < b);
const latest = (xs: unknown[]) => pickDate(xs, (a, b) => a > b);
function pickDate(xs: unknown[], better: (a: number, b: number) => boolean) {
  let best: unknown = null; let t = NaN;
  for (const x of xs) {
    if (x == null) continue;
    const v = new Date(String(x instanceof Date ? x.toISOString() : x)).getTime();
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(t) || better(v, t)) { t = v; best = x; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Facts

export function mergeMonthly(lists: CustomerMonthRow[][]): CustomerMonthRow[] {
  const by = new Map<number, CustomerMonthRow>();
  for (const r of lists.flat()) {
    const k = Date.UTC(r.month.getUTCFullYear(), r.month.getUTCMonth(), 1);
    const a = by.get(k);
    if (!a) { by.set(k, { ...r }); continue; }
    a.netSales = n(a.netSales) + n(r.netSales);
    a.orders = n(a.orders) + n(r.orders);
    a.returnsAmount = n(a.returnsAmount) + n(r.returnsAmount);
    a.returnsCount = n(a.returnsCount) + n(r.returnsCount);
    a.marketingTouches = n(a.marketingTouches) + n(r.marketingTouches);
    a.marketingEngagements = n(a.marketingEngagements) + n(r.marketingEngagements);
    a.tickets = n(a.tickets) + n(r.tickets);
  }
  return [...by.values()].sort((a, b) => a.month.getTime() - b.month.getTime());
}

/** Product lines: sales add up, a line counts as bought if any record bought it; peer penetration is the primary's. */
export function mergeProductLines(lists: ProductLineRow[][]): ProductLineRow[] {
  const by = new Map<string, ProductLineRow>();
  for (const r of lists.flat()) {
    const k = r.productLine ?? '';
    const a = by.get(k);
    if (!a) { by.set(k, { ...r }); continue; }
    a.netSalesTtm = n(a.netSalesTtm) + n(r.netSalesTtm);
    a.views90d = n(a.views90d) + n(r.views90d);
    a.purchasedTtm = !!a.purchasedTtm || !!r.purchasedTtm;
  }
  const rows = [...by.values()];
  const total = sum(rows, (r) => r.netSalesTtm);
  for (const r of rows) r.shareOfSalesTtm = total ? n(r.netSalesTtm) / total : 0;
  return rows;
}

export function mergeSkus(lists: CustomerSkuRow[][]): CustomerSkuRow[] {
  const by = new Map<string, CustomerSkuRow>();
  for (const r of lists.flat()) {
    const k = r.sku ?? '';
    const a = by.get(k);
    if (!a) { by.set(k, { ...r }); continue; }
    a.netSalesTtm = n(a.netSalesTtm) + n(r.netSalesTtm);
    a.netSalesPriorTtm = n(a.netSalesPriorTtm) + n(r.netSalesPriorTtm);
    a.unitsTtm = n(a.unitsTtm) + n(r.unitsTtm);
    a.returnsTtm = n(a.returnsTtm) + n(r.returnsTtm);
    a.lastPurchased = latest([a.lastPurchased, r.lastPurchased]) as typeof a.lastPurchased;
  }
  return [...by.values()];
}

export function mergeTimeline(lists: TimelineRow[][]): TimelineRow[] {
  return lists.flat().sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
}

/** Upsell: every record's recommendations, minus lines the combined customer already buys; best 3 by value. */
export function mergeUpsell(lists: UpsellRow[][], lines: ProductLineRow[]): UpsellRow[] {
  const bought = new Set(lines.filter((l) => l.purchasedTtm).map((l) => l.productLine));
  const by = new Map<string, UpsellRow>();
  for (const r of lists.flat()) {
    if (bought.has(r.productLine)) continue;
    const a = by.get(r.productLine ?? '');
    if (!a || n(r.estimatedAnnualValue) > n(a.estimatedAnnualValue)) by.set(r.productLine ?? '', r);
  }
  return [...by.values()].sort((a, b) => n(b.estimatedAnnualValue) - n(a.estimatedAnnualValue)).slice(0, 3)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function mergeSkuRecs(lists: SkuRecRow[][], skus: CustomerSkuRow[]): SkuRecRow[] {
  const bought = new Set(skus.filter((s) => n(s.netSalesTtm) > 0).map((s) => s.sku));
  const by = new Map<string, SkuRecRow>();
  for (const r of lists.flat()) {
    if (bought.has(r.sku)) continue;
    const a = by.get(r.sku ?? '');
    if (!a || n(r.estimatedAnnualValue) > n(a.estimatedAnnualValue)) by.set(r.sku ?? '', r);
  }
  return [...by.values()].sort((a, b) => n(b.estimatedAnnualValue) - n(a.estimatedAnnualValue)).slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------------------------------------------------------------------------------------------
// Profile

const CHANNEL_ORDER = ['Commerce', 'Email', 'SMS', 'Web', 'Support'];

export function mergeProfiles(profiles: (ProfileRow | null)[]): ProfileRow | null {
  const ps = profiles.filter((p): p is ProfileRow => !!p);
  const [primary] = ps;
  if (!primary || ps.length === 1) return primary ?? null;
  const any = (k: 'inErp' | 'inShopify' | 'inKlaviyo' | 'inZendesk' | 'emailMarketingConsent' | 'smsMarketingConsent') => ps.some((p) => !!p[k]);
  // active_channels_12m is "Commerce + Email + …" (c360_customer_dimension); keep the notebook's channel order
  const present = new Set(ps.flatMap((p) => (p.activeChannels12m ?? '').split(/\s*\+\s*/).filter(Boolean)));
  const channels = [...CHANNEL_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CHANNEL_ORDER.includes(c))];
  const merged: ProfileRow = {
    ...primary,
    inErp: any('inErp'), inShopify: any('inShopify'), inKlaviyo: any('inKlaviyo'), inZendesk: any('inZendesk'),
    emailMarketingConsent: any('emailMarketingConsent'), smsMarketingConsent: any('smsMarketingConsent'),
    linkedSourceRecords: sum(ps, (p) => p.linkedSourceRecords),
    lifetimeOrders: sum(ps, (p) => p.lifetimeOrders),
    klaviyoProfileCount: sum(ps, (p) => p.klaviyoProfileCount),
    zendeskUserCount: sum(ps, (p) => p.zendeskUserCount),
    locationCount: Math.max(...ps.map((p) => n(p.locationCount))) || primary.locationCount,
    customerSince: earliest(ps.map((p) => p.customerSince)) as ProfileRow['customerSince'],
    firstOrderDate: earliest(ps.map((p) => p.firstOrderDate)) as ProfileRow['firstOrderDate'],
    lastOrderDate: latest(ps.map((p) => p.lastOrderDate)) as ProfileRow['lastOrderDate'],
    lastEmailEngagementAt: latest(ps.map((p) => p.lastEmailEngagementAt)) as ProfileRow['lastEmailEngagementAt'],
    lastSupportContactAt: latest(ps.map((p) => p.lastSupportContactAt)) as ProfileRow['lastSupportContactAt'],
    activeChannels12m: channels.join(' + ') || undefined,
    activeChannelCount12m: channels.length,
    identityConfidence: 1,
  };
  merged.sourceSystemCount = [merged.inErp, merged.inShopify, merged.inKlaviyo, merged.inZendesk].filter(Boolean).length;
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Scores (same rules and caps as c360_customer_metrics)

export interface ScoreInputs {
  customerType: string;
  salesYoy: number | null;
  daysSinceOrder: number | null;
  returnRate: number | null;
  highPriorityOpen: number;
  openTickets: number;
  badCsat12m: number;
  tickets90d: number;
  engagementRate90d: number | null;
  engagementRatePrior: number | null;
  daysSinceEngaged: number | null;
  productLines: number;
}

export function churnScore(x: ScoreInputs): { score: number; band: 'High' | 'Medium' | 'Low'; drivers: ChurnDriver[] } {
  const gap = x.customerType === 'Wholesale' ? 45 : 150;
  const yoy = x.salesYoy ?? 0;
  const days = x.daysSinceOrder ?? 730;
  const rr = x.returnRate ?? 0;
  const e90 = x.engagementRate90d ?? 0;
  const prior = x.engagementRatePrior;
  const pts: [string, number, string][] = [
    ['Sales decline', Math.min(35, Math.max(0, -yoy * 50)), `Net sales ${yoy < 0 ? '' : '+'}${Math.round(yoy * 100)}% vs. prior year`],
    ['Overdue order', Math.min(25, Math.max(0, ((days - gap) / gap) * 12)), `${days} days since last order`],
    ['High returns', Math.min(12, Math.max(0, (rr - 0.06) * 150)), `Return rate ${(rr * 100).toFixed(1)}%`],
    ['Service issues', Math.min(18, x.highPriorityOpen * 6 + x.openTickets * 2 + x.badCsat12m * 4 + x.tickets90d * 2),
      `${x.openTickets} open tickets (${x.highPriorityOpen} high priority), ${x.badCsat12m} bad CSAT in 12 months`],
    ['Disengaging', Math.min(12, (prior != null && prior > 0.05 && e90 < prior * 0.5 ? 8 : 0) + ((x.daysSinceEngaged ?? 999) > 90 ? 4 : 0)),
      `Engagement ${Math.round(e90 * 100)}% (last 90 days) vs. ${Math.round((prior ?? 0) * 100)}% before`],
    ['Narrow product mix', x.productLines <= 1 ? 5 : x.productLines === 2 ? 3 : 0, `Buys from ${x.productLines} product line(s)`],
  ];
  const score = Math.min(100, Math.round(5 + pts.reduce((s, [, p]) => s + p, 0)));
  const drivers = pts.filter(([, p]) => p > 0).map(([driver, p, detail]) => ({ driver, points: Math.round(p * 10) / 10, detail }))
    .sort((a, b) => b.points - a.points).slice(0, 4);
  return { score, band: score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low', drivers };
}

/** Engagement rate over the last `from`..`to` months of the (merged) monthly facts, counting back from the latest month. */
function engagement(monthly: CustomerMonthRow[], fromBack: number, toBack: number): number | null {
  const last = monthly[monthly.length - 1]?.month;
  if (!last) return null;
  let t = 0; let e = 0;
  for (const r of monthly) {
    const back = (last.getUTCFullYear() - r.month.getUTCFullYear()) * 12 + (last.getUTCMonth() - r.month.getUTCMonth());
    if (back < fromBack || back > toBack) continue;
    t += n(r.marketingTouches); e += n(r.marketingEngagements);
  }
  return t > 0 ? e / t : null;
}

/**
 * The combined customer's metrics row: facts summed across the records, then re-scored. `population` (every customer's
 * metrics) ranks the combined upsell value the way the notebook does (percentile within the customer type).
 */
export function mergeMetrics(primary: MetricRow, others: (MetricRow | undefined)[], monthly: CustomerMonthRow[],
  lines: ProductLineRow[], upsell: UpsellRow[], population: MetricRow[]): MetricRow {
  const ms = [primary, ...others.filter((m): m is MetricRow => !!m)];
  const sales = sum(ms, (m) => m.netSalesTtm);
  const prior = sum(ms, (m) => m.netSalesPriorTtm);
  const returns = sum(ms, (m) => m.returnsTtm);
  const recent = monthly.slice(-3);
  const inputs: ScoreInputs = {
    customerType: primary.customerType ?? 'Direct',
    salesYoy: prior > 0 ? sales / prior - 1 : null,
    daysSinceOrder: minOf(ms.map((m) => m.daysSinceOrder)),
    returnRate: sales > 0 ? returns / sales : null,
    highPriorityOpen: sum(ms, (m) => m.highPriorityOpen),
    openTickets: sum(ms, (m) => m.openTickets),
    badCsat12m: sum(ms, (m) => m.badCsat12m),
    tickets90d: sum(recent, (r) => r.tickets),
    engagementRate90d: engagement(monthly, 0, 2),
    engagementRatePrior: engagement(monthly, 3, 11),
    daysSinceEngaged: minOf(ms.map((m) => m.daysSinceEngaged)),
    productLines: lines.filter((l) => l.purchasedTtm).length,
  };
  const s = churnScore(inputs);
  const upsellValue = sum(upsell, (u) => u.estimatedAnnualValue);
  const peers = population.filter((m) => m.customerType === primary.customerType);
  const below = peers.filter((m) => n(m.upsellValueEst) < upsellValue).length;
  const resolution = ms.map((m) => m.avgResolutionMinutes12m).filter((v) => v != null).map(Number);
  return {
    ...primary,
    netSalesTtm: sales, netSalesPriorTtm: prior, salesYoy: inputs.salesYoy,
    ordersTtm: sum(ms, (m) => m.ordersTtm), daysSinceOrder: inputs.daysSinceOrder,
    lastOrderDate: latest(ms.map((m) => m.lastOrderDate)) as MetricRow['lastOrderDate'],
    returnsTtm: returns, returnRateTtm: inputs.returnRate, productLinesTtm: inputs.productLines,
    tickets12m: sum(ms, (m) => m.tickets12m), openTickets: inputs.openTickets, highPriorityOpen: inputs.highPriorityOpen,
    badCsat12m: inputs.badCsat12m,
    avgResolutionMinutes12m: resolution.length ? Math.round(resolution.reduce((a, b) => a + b, 0) / resolution.length) : null,
    engagementRate90d: inputs.engagementRate90d, engagementRatePrior: inputs.engagementRatePrior, daysSinceEngaged: inputs.daysSinceEngaged,
    churnRiskScore: s.score, churnRiskBand: s.band, topChurnDriver: s.drivers[0]?.driver ?? null, churnDrivers: JSON.stringify(s.drivers),
    upsellValueEst: upsellValue,
    // percent_rank within the customer type, truncated to an int like the notebook
    upsellScore: peers.length ? Math.floor((below / Math.max(1, peers.length - 1)) * 100) : primary.upsellScore,
    topUpsellProductLine: upsell[0]?.productLine ?? null,
    revenueAtRisk: (sales * s.score) / 100,
  } as MetricRow;
}
