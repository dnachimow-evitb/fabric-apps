import { describe, expect, it } from 'vitest';

import type { CustomerMonthRow, MetricRow, ProductLineRow, ProfileRow, UpsellRow } from './c360';
import { churnScore, mergeMetrics, mergeMonthly, mergeProductLines, mergeProfiles, mergeUpsell, type ScoreInputs } from './merge-emulation';

const base: ScoreInputs = {
  customerType: 'Wholesale', salesYoy: 0.3068, daysSinceOrder: 50, returnRate: 0.02, highPriorityOpen: 0, openTickets: 0,
  badCsat12m: 0, tickets90d: 0, engagementRate90d: 0.3, engagementRatePrior: 0.3, daysSinceEngaged: 10, productLines: 1,
};

describe('churnScore', () => {
  it('matches the notebook score for a real customer (Rosen Supply Co.: 11)', () => {
    const s = churnScore(base);
    expect(s.score).toBe(11); // 5 base + 5 narrow mix + 1.3 overdue (50 days vs. 45-day cadence)
    expect(s.band).toBe('Low');
    expect(s.drivers.map((d) => d.driver)).toEqual(['Narrow product mix', 'Overdue order']);
  });

  it('scores a declining, overdue, unhappy account as high risk', () => {
    const s = churnScore({ ...base, salesYoy: -0.5, daysSinceOrder: 120, highPriorityOpen: 1, openTickets: 2, productLines: 3 });
    expect(s.score).toBe(Math.round(5 + 25 + 20 + 10)); // decline 25, overdue capped 25→20, service 6+4=10
    expect(s.band).toBe('High');
  });
});

const month = (ym: string, patch: Partial<CustomerMonthRow>) => ({
  month: new Date(`${ym}-01T00:00:00Z`), netSales: 0, orders: 0, returnsAmount: 0, returnsCount: 0, marketingTouches: 0, marketingEngagements: 0, tickets: 0, ...patch,
}) as CustomerMonthRow;

describe('merging facts', () => {
  it('adds up months across records', () => {
    const m = mergeMonthly([[month('2026-08', { netSales: 100, orders: 1 }), month('2026-09', { netSales: 50 })], [month('2026-09', { netSales: 25, tickets: 2 })]]);
    expect(m.map((r) => [r.month.toISOString().slice(0, 7), r.netSales, r.tickets])).toEqual([['2026-08', 100, 0], ['2026-09', 75, 2]]);
  });

  it('combines product lines and drops upsell for lines the combined customer buys', () => {
    const pl = (productLine: string, netSalesTtm: number, purchasedTtm: boolean) => ({ productLine, netSalesTtm, purchasedTtm, views90d: 0, peerPenetration: 0.5 }) as unknown as ProductLineRow;
    const lines = mergeProductLines([[pl('Locks', 300, true), pl('Hinges', 0, false)], [pl('Locks', 100, true), pl('Hinges', 100, true)]]);
    expect(lines.find((l) => l.productLine === 'Hinges')?.purchasedTtm).toBe(true);
    expect(Number(lines.find((l) => l.productLine === 'Locks')?.shareOfSalesTtm)).toBeCloseTo(0.8);
    const up = (productLine: string, estimatedAnnualValue: number) => ({ productLine, estimatedAnnualValue, rank: 1 }) as unknown as UpsellRow;
    expect(mergeUpsell([[up('Hinges', 900), up('Tools', 200)], [up('Tools', 400)]], lines).map((u) => [u.productLine, u.estimatedAnnualValue])).toEqual([['Tools', 400]]);
  });

  it('unions source systems and consent in the profile', () => {
    const p = mergeProfiles([
      { unifiedCustomerId: 'a', customerName: 'Ann', inErp: false, inShopify: true, inKlaviyo: false, inZendesk: false, linkedSourceRecords: 1, lifetimeOrders: 3, activeChannels12m: 'Commerce', emailMarketingConsent: false } as ProfileRow,
      { unifiedCustomerId: 'b', customerName: 'Ann B', inErp: false, inShopify: false, inKlaviyo: true, inZendesk: true, linkedSourceRecords: 2, lifetimeOrders: 0, activeChannels12m: 'Support + Email', emailMarketingConsent: true } as ProfileRow,
    ])!;
    expect(p.customerName).toBe('Ann');
    expect([p.inShopify, p.inKlaviyo, p.inZendesk, p.emailMarketingConsent]).toEqual([true, true, true, true]);
    expect(p.sourceSystemCount).toBe(3);
    expect(p.linkedSourceRecords).toBe(3);
    expect(p.activeChannels12m).toBe('Commerce + Email + Support');
  });

  it('re-scores the combined customer', () => {
    const a = { unifiedCustomerId: 'a', customerType: 'Direct', netSalesTtm: 400, netSalesPriorTtm: 1000, returnsTtm: 0, ordersTtm: 2, daysSinceOrder: 200, openTickets: 0, highPriorityOpen: 0, badCsat12m: 0, daysSinceEngaged: 20, upsellValueEst: 50, churnRiskScore: 60 } as unknown as MetricRow;
    const b = { unifiedCustomerId: 'b', customerType: 'Direct', netSalesTtm: 600, netSalesPriorTtm: 0, returnsTtm: 0, ordersTtm: 3, daysSinceOrder: 30, openTickets: 0, highPriorityOpen: 0, badCsat12m: 0, daysSinceEngaged: 5, upsellValueEst: 10, churnRiskScore: 20 } as unknown as MetricRow;
    const m = mergeMetrics(a, [b], [], [{ productLine: 'Locks', purchasedTtm: true } as ProductLineRow, { productLine: 'Tools', purchasedTtm: true } as ProductLineRow], [], [a, b]);
    expect(m.netSalesTtm).toBe(1000);
    expect(m.salesYoy).toBeCloseTo(0); // 1,000 vs. 1,000: the "decline" was a split identity
    expect(m.daysSinceOrder).toBe(30);
    expect(m.churnRiskScore).toBe(8); // 5 base + 3 for two product lines
    expect(m.churnRiskBand).toBe('Low');
  });
});
