import { describe, expect, it } from 'vitest';

import { ALL_FILTERS, type LineSkuRow, type LineUpsellRow, type MetricRow } from './c360';
import { buildSnapshot, describeFilters, slug } from './product-line-report';

const metric = (id: string, patch: Partial<MetricRow> = {}) => ({
  unifiedCustomerId: id, customerName: `Customer ${id}`, customerType: 'Wholesale', netSalesTtm: 1000, churnRiskBand: 'Low', churnRiskScore: 10, ...patch,
}) as MetricRow;

const sku = (id: string, code: string, patch: Partial<LineSkuRow> = {}) => ({
  unifiedCustomerId: id, customerType: 'Wholesale', sku: code, productName: `Product ${code}`,
  netSalesTtm: 100, netSalesPriorTtm: 80, unitsTtm: 10, returnsTtm: 5, ...patch,
}) as LineSkuRow;

describe('buildSnapshot', () => {
  const metrics = [
    metric('A', { netSalesTtm: 2000 }),
    metric('B', { customerType: 'Direct', churnRiskBand: 'High', churnRiskScore: 72 }),
    metric('C'), // active, does not buy the line
  ];
  const rows = [
    sku('A', 'S1', { netSalesTtm: 300, netSalesPriorTtm: 200, returnsTtm: 30 }),
    sku('A', 'S2', { netSalesTtm: 100, netSalesPriorTtm: 100, returnsTtm: 0 }),
    sku('B', 'S1', { customerType: 'Direct', netSalesTtm: 100, netSalesPriorTtm: 100, returnsTtm: 0 }),
    sku('Z', 'S1', { netSalesTtm: 9999 }), // not under the filters: ignored
  ];
  const upsell = [
    { unifiedCustomerId: 'C', estimatedAnnualValue: 400 },
    { unifiedCustomerId: 'A', estimatedAnnualValue: 999 }, // already buys: not a target
    { unifiedCustomerId: 'Z', estimatedAnnualValue: 999 }, // filtered out
  ] as LineUpsellRow[];

  const s = buildSnapshot('Hand Tools', ALL_FILTERS, metrics, rows, upsell);

  it('totals only customers under the filters', () => {
    expect(s.netSales).toBe(500);
    expect(s.netSalesPrior).toBe(400);
    expect(s.yoy).toBeCloseTo(0.25);
    expect(s.buyers).toBe(2);
    expect(s.activeCustomers).toBe(3);
    expect(s.penetration).toBeCloseTo(2 / 3);
    expect(s.shareOfSales).toBeCloseTo(500 / 4000);
    expect(s.returnRate).toBeCloseTo(30 / 500);
    expect(s.avgSpendPerBuyer).toBe(250);
  });

  it('ranks SKUs, customer types and customers', () => {
    expect(s.topSkus.map((k) => [k.sku, k.netSales, k.buyers])).toEqual([['S1', 400, 2], ['S2', 100, 1]]);
    expect(s.byType).toEqual([{ type: 'Wholesale', netSales: 400, buyers: 1 }, { type: 'Direct', netSales: 100, buyers: 1 }]);
    expect(s.topCustomers.map((c) => c.id)).toEqual(['A', 'B']);
    expect(s.returnWatch.map((k) => k.sku)).toEqual(['S1']);
  });

  it('flags high-risk buyers and finds upsell targets', () => {
    expect(s.highRiskBuyers).toBe(1);
    expect(s.highRiskSales).toBe(100);
    expect(s.upsellTargets).toBe(1);
    expect(s.upsellValue).toBe(400);
    expect(s.topUpsell[0]).toMatchObject({ id: 'C', name: 'Customer C' });
  });

  it('handles a line nobody under the filters buys', () => {
    const e = buildSnapshot('Safety Gear', ALL_FILTERS, metrics, [], []);
    expect(e.buyers).toBe(0);
    expect(e.penetration).toBe(0);
    expect(e.yoy).toBeNull();
    expect(e.returnRate).toBeNull();
    expect(e.topSkus).toEqual([]);
  });
});

describe('describeFilters', () => {
  it('lists active slicers only', () => {
    expect(describeFilters(ALL_FILTERS)).toEqual([]);
    expect(describeFilters({ ...ALL_FILTERS, customerType: 'Direct', region: 'West', riskBand: 'High', proOnly: true }))
      .toEqual(['Direct (B2C)', 'Region: West', 'High churn risk', 'Pro members only']);
  });
});

describe('slug', () => {
  it('makes file-name-safe names', () => {
    expect(slug('Storage & Organization')).toBe('Storage-and-Organization');
    expect(slug('Hand Tools')).toBe('Hand-Tools');
  });
});
