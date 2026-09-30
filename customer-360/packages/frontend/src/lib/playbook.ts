// Growth Playbook: turns the per-customer scores into a budget-constrained commercial plan.
// Each customer's next best action (from gold_customer_metrics) maps to a play: an offer with a cost (rebate, coupon,
// bundle discount, goodwill credit) and planning assumptions for how much at-risk revenue it keeps, how much upsell it
// wins and how much of the customer's returns it avoids. The planner funds the best return on spend first, until the
// incentive budget runs out or returns fall below the minimum.

type CostBase = 'sales' | 'upsell';

export const PLAYS = [
  {
    id: 'Service recovery', save: 0.45, win: 0.05, returnsCut: 0, cost: 0.02, base: 'sales' as CostBase,
    offer: 'Goodwill credit of 2% of annual spend', what: 'Fast-track the open tickets, then a credit on the next order',
    trigger: 'High-priority ticket open and churn risk ≥ 60',
  },
  {
    id: 'Loyalty offer', save: 0.35, win: 0.05, returnsCut: 0, cost: 0.05, base: 'sales' as CostBase,
    offer: 'Volume rebate (wholesale) or loyalty coupon (direct) worth 5% of annual spend',
    what: 'Tie a rebate or coupon to the next order to stop the decline', trigger: 'Churn risk ≥ 60 and sales down more than 15% YoY',
  },
  {
    id: 'Returns fix', save: 0.3, win: 0.05, returnsCut: 0.4, cost: 0.02, base: 'sales' as CostBase,
    offer: 'Replacement credit of 2% of annual spend', what: 'Steer to better-rated SKUs, fix spec and fit issues, credit the next order',
    trigger: 'Return rate above 12%',
  },
  {
    id: 'Cross-sell bundle', save: 0.1, win: 0.25, returnsCut: 0, cost: 0.1, base: 'upsell' as CostBase,
    offer: 'Intro discount of 10% on the recommended product line', what: 'Bundle the recommended line with what they already buy',
    trigger: 'Upsell score ≥ 60 with a recommended product line',
  },
  {
    id: 'Win-back campaign', save: 0.15, win: 0.1, returnsCut: 0, cost: 0.015, base: 'sales' as CostBase,
    offer: 'Time-limited coupon worth 1.5% of annual spend', what: 'Personalised email / SMS with products they browsed',
    trigger: 'No marketing response in 90+ days',
  },
] as const;
export type PlayId = (typeof PLAYS)[number]['id'];
const PLAY = new Map(PLAYS.map((p) => [p.id as PlayId, p]));

/** Direct (B2C) customers are reached by eCommerce marketing (automated campaigns), wholesale by their account manager. */
export const ECOMMERCE = 'eCommerce marketing';
/** Smallest offer worth sending (a coupon below this is noise). */
export const MIN_OFFER = 10;

/** Maps the stored next_best_action text (see c360_customer_metrics) to a play; "Maintain cadence" → null. */
export function playFor(nextBestAction: string | null | undefined): PlayId | null {
  const a = nextBestAction ?? '';
  if (a.startsWith('Resolve')) return 'Service recovery';
  if (a.startsWith('Retention review')) return 'Loyalty offer';
  if (a.startsWith('Investigate returns')) return 'Returns fix';
  if (a.startsWith('Pitch')) return 'Cross-sell bundle';
  if (a.startsWith('Re-engage')) return 'Win-back campaign';
  return null;
}

export interface PlaybookRow {
  unifiedCustomerId?: string | null;
  customerName?: string | null;
  customerType?: string | null;
  accountManager?: string | null;
  nextBestAction?: string | null;
  topChurnDriver?: string | null;
  topUpsellProductLine?: string | null;
  revenueAtRisk?: number | string | null;
  upsellValueEst?: number | string | null;
  netSalesTtm?: number | string | null;
  returnsTtm?: number | string | null;
  ordersTtm?: number | string | null;
  productLinesTtm?: number | string | null;
  churnRiskScore?: number | string | null;
  churnRiskBand?: string | null;
}

export interface Candidate {
  id: string; name: string; type: string; owner: string; play: PlayId; action: string; driver: string; upsellLine: string;
  cost: number; save: number; upsell: number; returnsAvoided: number; value: number; roi: number;
  /** Expected probability the customer is kept who would otherwise churn. */
  kept: number; netSales: number; risk: number; band: string;
}

export interface Levers {
  /** Incentive budget for the next 12 months ($). */
  budget: number;
  /** Scales every save, win and returns-cut rate (1 = the assumptions as listed). */
  response: number;
  /** Only fund actions returning at least this multiple of their cost. */
  minRoi: number;
  plays: PlayId[];
}

export const DEFAULT_LEVERS: Levers = { budget: 50000, response: 1, minRoi: 2, plays: PLAYS.map((p) => p.id) };

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

export function candidates(rows: PlaybookRow[], lv: Levers): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    const play = playFor(r.nextBestAction);
    if (!play || !lv.plays.includes(play)) continue;
    const p = PLAY.get(play)!;
    const rate = (x: number) => Math.min(1, x * lv.response);
    const risk = n(r.revenueAtRisk);
    const upsellEst = n(r.upsellValueEst);
    const netSales = n(r.netSalesTtm);
    const save = rate(p.save) * risk;
    const upsell = rate(p.win) * upsellEst;
    const returnsAvoided = rate(p.returnsCut) * n(r.returnsTtm);
    const value = save + upsell + returnsAvoided;
    const cost = Math.max(MIN_OFFER, p.cost * (p.base === 'upsell' ? upsellEst : netSales));
    if (value <= 0) continue;
    const direct = r.customerType === 'Direct';
    out.push({
      id: r.unifiedCustomerId ?? '', name: r.customerName ?? '', type: r.customerType ?? '',
      owner: direct || !r.accountManager ? ECOMMERCE : r.accountManager, play, action: r.nextBestAction ?? '',
      driver: r.topChurnDriver ?? 'No risk driver', upsellLine: r.topUpsellProductLine ?? '',
      cost, save, upsell, returnsAvoided, value, roi: value / cost,
      kept: rate(p.save) * n(r.churnRiskScore) / 100, netSales, risk, band: r.churnRiskBand ?? '',
    });
  }
  return out.sort((a, b) => b.roi - a.roi || b.value - a.value);
}

export interface OwnerPlan { owner: string; spend: number; value: number; save: number; upsell: number; returnsAvoided: number; actions: Candidate[] }

export interface Drivers {
  customers: number;
  /** Active = ordered in the last 12 months. */
  active: number;
  linesPerCustomer: number;
  returnRate: number;
}

export interface Plan {
  candidates: Candidate[];
  selected: Candidate[];
  owners: OwnerPlan[];
  spend: number;
  save: number;
  upsell: number;
  returnsAvoided: number;
  /** Gross value (save + upsell + returns avoided) less the cost of the offers. */
  net: number;
  kept: number;
  /** Net sales, last 12 months, over every customer in the selection. */
  baseline: number;
  /** Expected loss if nothing is done: Σ revenue_at_risk. */
  atRisk: number;
  before: Drivers;
  after: Drivers;
}

/** Funds actions best return-on-spend first until the budget is spent (greedy knapsack; near-optimal at this scale). */
export function plan(rows: PlaybookRow[], lv: Levers): Plan {
  const cands = candidates(rows, lv);
  const selected: Candidate[] = [];
  let left = lv.budget;
  for (const c of cands) {
    if (c.roi < lv.minRoi) break;
    if (c.cost > left) continue;
    left -= c.cost;
    selected.push(c);
  }
  const owners = new Map<string, OwnerPlan>();
  for (const c of selected) {
    const o = owners.get(c.owner) ?? { owner: c.owner, spend: 0, value: 0, save: 0, upsell: 0, returnsAvoided: 0, actions: [] };
    o.spend += c.cost; o.value += c.value; o.save += c.save; o.upsell += c.upsell; o.returnsAvoided += c.returnsAvoided; o.actions.push(c);
    owners.set(c.owner, o);
  }
  const sum = (xs: Candidate[], f: (c: Candidate) => number) => xs.reduce((s, c) => s + f(c), 0);
  const spend = sum(selected, (c) => c.cost);
  const save = sum(selected, (c) => c.save);
  const upsell = sum(selected, (c) => c.upsell);
  const returnsAvoided = sum(selected, (c) => c.returnsAvoided);

  const baseline = rows.reduce((s, r) => s + n(r.netSalesTtm), 0);
  const returns = rows.reduce((s, r) => s + n(r.returnsTtm), 0);
  const activeRows = rows.filter((r) => n(r.ordersTtm) > 0);
  const lines = activeRows.reduce((s, r) => s + n(r.productLinesTtm), 0);
  const active = activeRows.length || 1;
  // each won cross-sell adds (in expectation) one product line to that customer
  const linesWon = selected.reduce((s, c) => s + (c.upsell > 0 ? lvRate(c.play, 'win', lv) : 0), 0);
  const before: Drivers = { customers: rows.length, active: activeRows.length, linesPerCustomer: lines / active, returnRate: baseline ? returns / baseline : 0 };
  const after: Drivers = {
    customers: rows.length, active: activeRows.length, linesPerCustomer: (lines + linesWon) / active,
    returnRate: baseline ? (returns - returnsAvoided) / baseline : 0,
  };

  return {
    candidates: cands, selected, owners: [...owners.values()].sort((a, b) => b.value - a.value),
    spend, save, upsell, returnsAvoided, net: save + upsell + returnsAvoided - spend, kept: sum(selected, (c) => c.kept),
    baseline, atRisk: rows.reduce((s, r) => s + n(r.revenueAtRisk), 0), before, after,
  };
}

function lvRate(play: PlayId, k: 'save' | 'win' | 'returnsCut', lv: Levers) {
  return Math.min(1, (PLAY.get(play)?.[k] ?? 0) * lv.response);
}

/** Total cost of funding every candidate (the most a budget can usefully be). */
export const fullCost = (cands: Candidate[]) => cands.reduce((s, c) => s + c.cost, 0);

/** Cumulative value vs. cumulative spend, best return first (downsampled). */
export function gainCurve(cands: Candidate[], maxPoints = 240): { spend: number; value: number; customers: number }[] {
  const pts = [{ spend: 0, value: 0, customers: 0 }];
  let s = 0; let v = 0;
  cands.forEach((c, i) => { s += c.cost; v += c.value; pts.push({ spend: s, value: v, customers: i + 1 }); });
  if (pts.length <= maxPoints) return pts;
  const step = (pts.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => pts[Math.round(i * step)]);
}

export interface Flow { source: string; target: string; value: number }

/** Plan value flowing churn driver → play → owner (owners beyond `topOwners` are grouped). */
export function flows(selected: Candidate[], topOwners = 6): { stage1: Flow[]; stage2: Flow[] } {
  const byOwner = new Map<string, number>();
  for (const c of selected) byOwner.set(c.owner, (byOwner.get(c.owner) ?? 0) + c.value);
  const keep = new Set([...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, topOwners).map(([o]) => o));
  const add = (m: Map<string, Flow>, source: string, target: string, value: number) => {
    const k = `${source}→${target}`;
    const f = m.get(k) ?? { source, target, value: 0 };
    f.value += value; m.set(k, f);
  };
  const s1 = new Map<string, Flow>(); const s2 = new Map<string, Flow>();
  for (const c of selected) {
    add(s1, c.driver, c.play, c.value);
    add(s2, c.play, keep.has(c.owner) ? c.owner : 'Other owners', c.value);
  }
  return { stage1: [...s1.values()], stage2: [...s2.values()] };
}

/** The plan as CSV, one row per action, for handing to the team. */
export function planCsv(p: Plan): string {
  const txt = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (v: number) => String(Math.round(v));
  const head = ['Owner', 'Customer', 'Type', 'Play', 'Offer', 'Next best action', 'Offer cost', 'Revenue kept', 'Upsell', 'Returns avoided', 'Expected value', 'Return on spend', 'Churn risk'];
  const lines = p.owners.flatMap((o) => o.actions.map((c) => [
    txt(o.owner), txt(c.name), txt(c.type), txt(c.play), txt(PLAY.get(c.play)?.offer ?? ''), txt(c.action),
    num(c.cost), num(c.save), num(c.upsell), num(c.returnsAvoided), num(c.value), c.roi.toFixed(1), txt(c.band),
  ].join(',')));
  return [head.map(txt).join(','), ...lines].join('\r\n');
}
