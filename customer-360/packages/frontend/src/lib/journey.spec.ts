import { describe, expect, it } from 'vitest';

import type { CustomerMonthRow } from './c360';
import { buildJourney, finaleFor, frameAt, narrate, schedule } from './journey';

const month = (ym: string, patch: Partial<CustomerMonthRow>) => ({
  month: new Date(`${ym}-01T00:00:00Z`), netSales: 0, orders: 0, returnsAmount: 0, returnsCount: 0, marketingTouches: 0, marketingEngagements: 0, tickets: 0, ...patch,
}) as CustomerMonthRow;

const rows = [
  month('2025-03', { orders: 2, netSales: 4100, marketingTouches: 5, marketingEngagements: 1, returnsCount: 1, returnsAmount: 80, tickets: 1 }),
  month('2025-03', { orders: 1, netSales: 900 }), // a merged second customer in the same month
  month('2025-06', { marketingTouches: 4 }),
];

describe('buildJourney', () => {
  const stops = buildJourney(rows);

  it('covers every month of the data, in order', () => {
    expect(stops).toHaveLength(24);
    expect(stops[0].month.toISOString().slice(0, 7)).toBe('2024-10');
    expect(stops[23].month.toISOString().slice(0, 7)).toBe('2026-09');
  });

  it('acts out a month as emails, orders, returns, then tickets', () => {
    const mar = stops.find((s) => s.month.toISOString().startsWith('2025-03'))!;
    expect(mar.acts.map((a) => a.kind)).toEqual(['email', 'buy', 'return', 'stomp']);
    expect(mar.acts[1]).toMatchObject({ count: 3, amount: 5000, label: 'placed 3 orders ($5K)' });
    expect(mar.acts[2].label).toBe('returned 1 item ($80 refunded)');
    expect(mar.ignored).toBe(4);
  });

  it('keeps emails nobody opened as fly-pasts, not stops', () => {
    const jun = stops.find((s) => s.month.toISOString().startsWith('2025-06'))!;
    expect(jun.acts).toEqual([]);
    expect(jun.ignored).toBe(4);
  });
});

describe('schedule and frames', () => {
  const stops = buildJourney(rows);
  const s = schedule(stops);

  it('walks, stops for each act, then ends with a finale', () => {
    expect(s.segments.map((x) => x.kind)).toEqual(['walk', 'act', 'act', 'act', 'act', 'walk', 'finale']);
    expect(s.segments.at(-1)!.end).toBeCloseTo(s.total);
  });

  it('walks from before the first month to past the last', () => {
    expect(frameAt(s, 0).pos).toBeCloseTo(-0.5);
    expect(frameAt(s, s.total).pos).toBeCloseTo(23.5);
    expect(frameAt(s, s.total + 10).kind).toBe('finale');
  });

  it('narrates each beat', () => {
    const buy = s.segments[2];
    expect(narrate(frameAt(s, (buy.start + buy.end) / 2), 'active', stops)).toBe('Mar 2025: placed 3 orders ($5K).');
    expect(narrate(frameAt(s, s.total), 'lapsed', stops)).toMatch(/^Lapsed/);
  });

  it('shortens acts for very busy customers', () => {
    const busy = buildJourney(Array.from({ length: 24 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 9 + i, 1));
      return month(d.toISOString().slice(0, 7), { orders: 9, netSales: 1000, marketingEngagements: 3, returnsCount: 1, returnsAmount: 10, tickets: 2 });
    }));
    expect(schedule(busy).total).toBeLessThan(90);
  });
});

describe('finaleFor', () => {
  it('follows the lifecycle stage, with high churn risk counting as at risk', () => {
    expect(finaleFor('Lapsed', 'High')).toBe('lapsed');
    expect(finaleFor('Active', 'High')).toBe('at-risk');
    expect(finaleFor('New', 'Low')).toBe('new');
    expect(finaleFor('Active', 'Low')).toBe('active');
  });
});
