// Product line snapshot: the key figures for one product line under the page filters, one page per line.
// Customer × SKU rows (gold_customer_sku) are filtered server-side by type / region / owner and then kept only
// for customers in the filtered metrics, so every slicer applies. Figures are trailing 12 months: the gold
// tables carry no month for product lines, so the date range does not apply.
import { cityLabel, type Filters, type LineSkuRow, type LineUpsellRow, type MetricRow } from './c360';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export interface SkuLine { sku: string; name: string; netSales: number; yoy: number | null; returnRate: number | null; buyers: number }
export interface CustomerLine { id: string; name: string; type: string; netSales: number; riskBand: string; riskScore: number | null }
export interface UpsellTarget { id: string; name: string; type: string; value: number }

export interface LineSnapshot {
  line: string;
  filters: string[];
  /** Customers under the filters with sales in the last 12 months. */
  activeCustomers: number;
  buyers: number;
  penetration: number | null;
  netSales: number;
  netSalesPrior: number;
  yoy: number | null;
  /** Line sales as a share of all sales from customers under the filters. */
  shareOfSales: number | null;
  units: number;
  returns: number;
  returnRate: number | null;
  avgSpendPerBuyer: number | null;
  byType: { type: string; netSales: number; buyers: number }[];
  topSkus: SkuLine[];
  /** Highest return rates among SKUs with meaningful sales. */
  returnWatch: SkuLine[];
  topCustomers: CustomerLine[];
  highRiskBuyers: number;
  highRiskSales: number;
  upsellTargets: number;
  upsellValue: number;
  topUpsell: UpsellTarget[];
}

/** Human-readable list of the active slicers (the date range is not used by these reports). */
export function describeFilters(f: Filters): string[] {
  const out: string[] = [];
  if (f.customerType !== 'all') out.push(f.customerType === 'Wholesale' ? 'Wholesale (B2B)' : 'Direct (B2C)');
  if (f.region !== 'all') out.push(`Region: ${f.region}`);
  if (f.states.length) out.push(`State: ${f.states.join(', ')}`);
  if (f.cities.length) out.push(`City: ${f.cities.map(cityLabel).join('; ')}`);
  if (f.owner !== 'all') out.push(`Owner: ${f.owner}`);
  if (f.riskBand !== 'all') out.push(`${f.riskBand} churn risk`);
  if (f.lifecycle !== 'all') out.push(`Lifecycle: ${f.lifecycle}`);
  if (f.productLine !== 'all') out.push(`Buys ${f.productLine}`);
  if (f.proOnly) out.push('Pro members only');
  return out;
}

export function buildSnapshot(line: string, filters: Filters, metrics: MetricRow[], skuRows: LineSkuRow[], upsellRows: LineUpsellRow[]): LineSnapshot {
  const byId = new Map(metrics.map((m) => [m.unifiedCustomerId ?? '', m]));
  const rows = skuRows.filter((r) => byId.has(r.unifiedCustomerId ?? ''));
  const active = metrics.filter((m) => n(m.netSalesTtm) > 0);

  const perCustomer = new Map<string, number>();
  const perSku = new Map<string, { name: string; sales: number; prior: number; returns: number; buyers: Set<string> }>();
  const perType = new Map<string, { sales: number; buyers: Set<string> }>();
  let netSales = 0; let prior = 0; let units = 0; let returns = 0;
  for (const r of rows) {
    const id = r.unifiedCustomerId ?? '';
    const sales = n(r.netSalesTtm);
    netSales += sales; prior += n(r.netSalesPriorTtm); units += n(r.unitsTtm); returns += n(r.returnsTtm);
    perCustomer.set(id, (perCustomer.get(id) ?? 0) + sales);
    const s = perSku.get(r.sku ?? '') ?? { name: r.productName ?? r.sku ?? '', sales: 0, prior: 0, returns: 0, buyers: new Set<string>() };
    s.sales += sales; s.prior += n(r.netSalesPriorTtm); s.returns += n(r.returnsTtm);
    if (sales > 0) s.buyers.add(id);
    perSku.set(r.sku ?? '', s);
    const type = r.customerType ?? byId.get(id)?.customerType ?? 'Unknown';
    const t = perType.get(type) ?? { sales: 0, buyers: new Set<string>() };
    t.sales += sales;
    if (sales > 0) t.buyers.add(id);
    perType.set(type, t);
  }

  const buyerIds = [...perCustomer].filter(([, s]) => s > 0).map(([id]) => id);
  const skus: SkuLine[] = [...perSku].map(([sku, s]) => ({
    sku, name: s.name, netSales: s.sales, buyers: s.buyers.size,
    yoy: s.prior > 0 ? s.sales / s.prior - 1 : null, returnRate: ratio(s.returns, s.sales),
  }));
  // A SKU joins the watch list only with at least 2% of line sales, so tiny SKUs don't top it on noise.
  const watchFloor = netSales * 0.02;

  const topCustomers: CustomerLine[] = buyerIds
    .map((id) => {
      const m = byId.get(id);
      return {
        id, name: m?.customerName ?? id, type: m?.customerType ?? '', netSales: perCustomer.get(id) ?? 0,
        riskBand: m?.churnRiskBand ?? 'Low', riskScore: m?.churnRiskScore ?? null,
      };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, 5);

  const highRisk = buyerIds.filter((id) => byId.get(id)?.churnRiskBand === 'High');

  const upsellById = new Map<string, number>();
  for (const u of upsellRows) {
    const id = u.unifiedCustomerId ?? '';
    if (byId.has(id) && !perCustomer.get(id)) upsellById.set(id, Math.max(upsellById.get(id) ?? 0, n(u.estimatedAnnualValue)));
  }
  const topUpsell: UpsellTarget[] = [...upsellById]
    .map(([id, value]) => ({ id, value, name: byId.get(id)?.customerName ?? id, type: byId.get(id)?.customerType ?? '' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const allSales = active.reduce((s, m) => s + n(m.netSalesTtm), 0);
  const typeOrder = ['Wholesale', 'Direct'];

  return {
    line,
    filters: describeFilters(filters),
    activeCustomers: active.length,
    buyers: buyerIds.length,
    penetration: ratio(buyerIds.length, active.length),
    netSales,
    netSalesPrior: prior,
    yoy: prior > 0 ? netSales / prior - 1 : null,
    shareOfSales: ratio(netSales, allSales),
    units,
    returns,
    returnRate: ratio(returns, netSales),
    avgSpendPerBuyer: ratio(netSales, buyerIds.length),
    byType: [...perType]
      .map(([type, t]) => ({ type, netSales: t.sales, buyers: t.buyers.size }))
      .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)),
    topSkus: [...skus].sort((a, b) => b.netSales - a.netSales).slice(0, 6),
    returnWatch: skus.filter((s) => s.netSales >= watchFloor && s.netSales > 0 && (s.returnRate ?? 0) > 0)
      .sort((a, b) => (b.returnRate ?? 0) - (a.returnRate ?? 0)).slice(0, 3),
    topCustomers,
    highRiskBuyers: highRisk.length,
    highRiskSales: highRisk.reduce((s, id) => s + (perCustomer.get(id) ?? 0), 0),
    upsellTargets: upsellById.size,
    upsellValue: [...upsellById.values()].reduce((s, v) => s + v, 0),
    topUpsell,
  };
}

/** "Hand Tools" → "Hand-Tools", for file names. */
export function slug(s: string): string {
  return s.replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
