import { describe, expect, it } from 'vitest';

import { ALL_FILTERS, type Filters } from './c360';
import { UPSTREAM, VISUALS, slicerPredicates } from './visual-lineage';

const f: Filters = { ...ALL_FILTERS, customerType: 'Wholesale', region: "O'Hare", states: ['IL', 'MN'], cities: ['Chicago|IL'], proOnly: true };

describe('slicerPredicates', () => {
  it('writes every slicer as SQL, escaping quotes', () => {
    expect(slicerPredicates(f)).toEqual([
      "customer_type = 'Wholesale'", "region = 'O''Hare'", "state IN ('IL', 'MN')", "city IN ('Chicago')", 'is_pro_member = 1',
    ]);
  });

  it('limits the predicates to the columns a table carries', () => {
    expect(slicerPredicates(f, 'basic')).toEqual(["customer_type = 'Wholesale'", "region = 'O''Hare'"]);
    expect(slicerPredicates(f, 'type')).toEqual(["customer_type = 'Wholesale'"]);
  });
});

describe('VISUALS', () => {
  it('has unique ids and documents every table it reads', () => {
    expect(new Set(VISUALS.map((v) => v.id)).size).toBe(VISUALS.length);
    for (const v of VISUALS) for (const t of v.tables) expect(UPSTREAM[t.name], `${v.id} → ${t.name}`).toBeDefined();
  });

  it('builds SQL for the current filters', () => {
    const sales = VISUALS.find((v) => v.id === 'kpi-sales')!.sql(f);
    expect(sales).toContain("state IN ('IL', 'MN')");
    expect(sales).toContain(`month BETWEEN '${f.range.from}-01' AND '${f.range.to}-01'`);
    // the map ignores its own city selection
    expect(VISUALS.find((v) => v.id === 'map')!.sql(f)).not.toContain('city IN');
    for (const v of VISUALS) expect(v.sql(f).length).toBeGreaterThan(0);
  });
});
