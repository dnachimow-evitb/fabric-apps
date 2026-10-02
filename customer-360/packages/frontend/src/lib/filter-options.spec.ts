import { describe, expect, it } from 'vitest';

import { ALL_FILTERS, type Filters } from './c360';
import { applyFilterChange, filterOptions, type SlicerRow } from './filter-options';

const ROWS: SlicerRow[] = [
  { customerType: 'Wholesale', region: 'West', state: 'CA', city: 'Los Angeles', accountManager: 'Ana', churnRiskBand: 'High', lifecycleStage: 'Active', productLinesBought: '|Locks|Hinges|' },
  { customerType: 'Wholesale', region: 'West', state: 'WA', city: 'Seattle', accountManager: 'Ana', churnRiskBand: 'Low', lifecycleStage: 'Active', productLinesBought: '|Locks|' },
  { customerType: 'Direct', region: 'West', state: 'CA', city: 'San Francisco', churnRiskBand: 'Medium', lifecycleStage: 'New', productLinesBought: '|Tools|', isProMember: true },
  { customerType: 'Wholesale', region: 'South', state: 'TX', city: 'Dallas', accountManager: 'Ben', churnRiskBand: 'High', lifecycleStage: 'At Risk', productLinesBought: '|Hinges|' },
  { customerType: 'Direct', region: 'South', state: 'FL', city: 'Miami', churnRiskBand: 'Low', lifecycleStage: 'Lapsed', productLinesBought: '|' },
];

const f = (patch: Partial<Filters>): Filters => ({ ...ALL_FILTERS, ...patch });

describe('filterOptions', () => {
  it('lists every value when nothing is selected', () => {
    const o = filterOptions(ROWS, ALL_FILTERS);
    expect(o.regions).toEqual(['South', 'West']);
    expect(o.states).toEqual(['CA', 'FL', 'TX', 'WA']);
    expect(o.riskBands).toEqual(['High', 'Medium', 'Low']);
    expect(o.productLines).toEqual(['Hinges', 'Locks', 'Tools']);
  });

  it('limits states, cities and owners to the selected region', () => {
    const o = filterOptions(ROWS, f({ regions: ['West'] }));
    expect(o.states).toEqual(['CA', 'WA']);
    expect(o.cities).toEqual(['Los Angeles|CA', 'San Francisco|CA', 'Seattle|WA']);
    expect(o.owners).toEqual(['Ana']);
    // a slicer never filters its own list
    expect(o.regions).toEqual(['South', 'West']);
  });

  it('cross-filters in every direction', () => {
    const o = filterOptions(ROWS, f({ states: ['TX'], customerType: 'Wholesale' }));
    expect(o.regions).toEqual(['South']);
    expect(o.lifecycles).toEqual(['At Risk']);
    expect(o.customerTypes).toEqual(['Wholesale']);
  });

  it('matches any of several values within one slicer', () => {
    const o = filterOptions(ROWS, f({ riskBands: ['High', 'Medium'] }));
    expect(o.states).toEqual(['CA', 'TX']);
    expect(filterOptions(ROWS, f({ productLines: ['Tools', 'Hinges'] })).regions).toEqual(['South', 'West']);
    expect(filterOptions(ROWS, f({ productLines: ['Tools', 'Hinges'], regions: ['South'] })).owners).toEqual(['Ben']);
  });
});

describe('applyFilterChange', () => {
  it('drops states outside a newly picked region but keeps the region', () => {
    const prev = f({ states: ['CA', 'TX'] });
    const next = applyFilterChange(ROWS, prev, { ...prev, regions: ['West'] });
    expect(next.regions).toEqual(['West']);
    expect(next.states).toEqual(['CA']);
  });

  it('drops only the picked values that no longer match', () => {
    const prev = f({ owners: ['Ana', 'Ben'], cities: ['Dallas|TX', 'Seattle|WA'] });
    const next = applyFilterChange(ROWS, prev, { ...prev, regions: ['West'] });
    expect(next.owners).toEqual(['Ana']);
    expect(next.cities).toEqual(['Seattle|WA']);
  });

  it('keeps a value while any picked region still has it', () => {
    const prev = f({ owners: ['Ben'] });
    expect(applyFilterChange(ROWS, prev, { ...prev, regions: ['West', 'South'] }).owners).toEqual(['Ben']);
  });

  it('turns off "Pro members only" when no Pro member remains', () => {
    const prev = f({ proOnly: true });
    expect(applyFilterChange(ROWS, prev, { ...prev, regions: ['South'] }).proOnly).toBe(false);
    expect(applyFilterChange(ROWS, prev, { ...prev, regions: ['West'] }).proOnly).toBe(true);
  });

  it('applies changes untouched while customers are still loading', () => {
    const next = f({ regions: ['West'], states: ['TX'] });
    expect(applyFilterChange([], ALL_FILTERS, next)).toBe(next);
  });
});
