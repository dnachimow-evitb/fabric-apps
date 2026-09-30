import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS, ECOMMERCE, candidates, flows, fullCost, gainCurve, plan, planCsv, playFor, type PlaybookRow } from './playbook';

const ROWS: PlaybookRow[] = [
  { unifiedCustomerId: 'a', customerName: 'Acme', customerType: 'Wholesale', accountManager: 'Ana', nextBestAction: 'Resolve 2 high-priority ticket(s), then owner call', topChurnDriver: 'Service issues', revenueAtRisk: 10000, upsellValueEst: 0, netSalesTtm: 40000, returnsTtm: 1000, ordersTtm: 10, productLinesTtm: 3, churnRiskScore: 70 },
  { unifiedCustomerId: 'b', customerName: 'Bolt', customerType: 'Wholesale', accountManager: 'Ana', nextBestAction: 'Pitch Hinges', topChurnDriver: 'Narrow product mix', revenueAtRisk: 1000, upsellValueEst: 8000, netSalesTtm: 30000, returnsTtm: 0, ordersTtm: 8, productLinesTtm: 1, churnRiskScore: 10 },
  { unifiedCustomerId: 'c', customerName: 'Cara "C" Diaz', customerType: 'Direct', nextBestAction: 'Re-engage: no marketing response in 120 days', topChurnDriver: 'Disengaging', revenueAtRisk: 200, upsellValueEst: 100, netSalesTtm: 900, returnsTtm: 0, ordersTtm: 2, productLinesTtm: 1, churnRiskScore: 40 },
  { unifiedCustomerId: 'd', customerName: 'Dune', customerType: 'Wholesale', accountManager: 'Ben', nextBestAction: 'Maintain cadence', revenueAtRisk: 500, upsellValueEst: 500, netSalesTtm: 20000, returnsTtm: 0, ordersTtm: 0, productLinesTtm: 0, churnRiskScore: 5 },
  { unifiedCustomerId: 'e', customerName: 'Edge Tools', customerType: 'Wholesale', accountManager: 'Ben', nextBestAction: 'Investigate returns (25.0%)', topChurnDriver: 'High returns', revenueAtRisk: 2000, upsellValueEst: 0, netSalesTtm: 20000, returnsTtm: 5000, ordersTtm: 6, productLinesTtm: 2, churnRiskScore: 45 },
];

describe('playFor', () => {
  it('maps the stored next best action to a play', () => {
    expect(playFor('Retention review: sales down 30% YoY')).toBe('Loyalty offer');
    expect(playFor('Investigate returns (14.0%)')).toBe('Returns fix');
    expect(playFor('Maintain cadence')).toBeNull();
    expect(playFor(null)).toBeNull();
  });
});

describe('candidates', () => {
  it('prices each offer and ranks by return on spend', () => {
    const c = candidates(ROWS, DEFAULT_LEVERS);
    // Edge 6.5×, Acme 5.6×, Cara 3.0×, Bolt 2.6×; "Maintain cadence" skipped
    expect(c.map((x) => x.id)).toEqual(['e', 'a', 'c', 'b']);
    const edge = c.find((x) => x.id === 'e')!;
    expect(edge.cost).toBeCloseTo(400); // 2% of 20,000
    expect(edge.returnsAvoided).toBeCloseTo(2000); // 40% of 5,000
    expect(edge.value).toBeCloseTo(2600);
    const bolt = c.find((x) => x.id === 'b')!;
    expect(bolt.cost).toBeCloseTo(800); // 10% bundle discount on 8,000 of upsell
    const cara = c.find((x) => x.id === 'c')!;
    expect(cara.owner).toBe(ECOMMERCE);
    expect(cara.cost).toBeCloseTo(13.5);
  });

  it('respects play toggles and the response lever', () => {
    expect(candidates(ROWS, { ...DEFAULT_LEVERS, plays: ['Cross-sell bundle'] }).map((x) => x.id)).toEqual(['b']);
    const half = candidates(ROWS, { ...DEFAULT_LEVERS, response: 0.5 }).find((x) => x.id === 'a')!;
    expect(half.save).toBeCloseTo(2250);
  });
});

describe('plan', () => {
  it('funds the best returns within the budget and above the minimum return', () => {
    const p = plan(ROWS, { ...DEFAULT_LEVERS, budget: 1300, minRoi: 2 });
    expect(p.selected.map((x) => x.id)).toEqual(['e', 'a', 'c']); // Bolt (800) no longer fits
    expect(p.spend).toBeCloseTo(1213.5);
    expect(p.net).toBeCloseTo(2600 + 4500 + 40 - 1213.5);
    expect(plan(ROWS, { ...DEFAULT_LEVERS, minRoi: 3 }).selected.map((x) => x.id)).toEqual(['e', 'a']);
  });

  it('moves the business drivers', () => {
    const p = plan(ROWS, DEFAULT_LEVERS);
    expect(p.before.active).toBe(4);
    expect(p.before.linesPerCustomer).toBeCloseTo(7 / 4);
    expect(p.after.linesPerCustomer).toBeGreaterThan(p.before.linesPerCustomer);
    expect(p.after.returnRate).toBeLessThan(p.before.returnRate);
    expect(p.kept).toBeGreaterThan(0);
  });

  it('draws a monotonic gain curve and driver → play → owner flows', () => {
    const p = plan(ROWS, DEFAULT_LEVERS);
    const g = gainCurve(p.candidates);
    expect(g[0]).toEqual({ spend: 0, value: 0, customers: 0 });
    expect(g[g.length - 1].spend).toBeCloseTo(fullCost(p.candidates));
    expect(g.every((pt, i) => i === 0 || pt.value >= g[i - 1].value)).toBe(true);
    const f = flows(p.selected);
    const total = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);
    expect(total(f.stage1)).toBeCloseTo(total(f.stage2));
  });

  it('exports a CSV with quoted text', () => {
    const csv = planCsv(plan(ROWS, DEFAULT_LEVERS)).split('\r\n');
    expect(csv[0]).toContain('"Offer cost"');
    expect(csv.some((l) => l.includes('"Cara ""C"" Diaz"'))).toBe(true);
  });
});
