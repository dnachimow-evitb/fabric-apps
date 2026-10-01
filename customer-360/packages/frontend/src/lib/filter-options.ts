// Dependent (cross-filtering) slicers. Each slicer lists only the values that still exist among customers matching
// every *other* slicer, so picking a region narrows the states, owners, cities and so on (and vice versa).
// When a change leaves another slicer's selection with no matching customers, that selection is dropped.
import { ALL_FILTERS, LIFECYCLE_STAGES, RISK_BANDS, cityKey, type Filters } from './c360';

/** The customer attributes the slicers read (a subset of a gold_customer_metrics row). */
export interface SlicerRow {
  customerType?: string | null;
  region?: string | null;
  state?: string | null;
  city?: string | null;
  accountManager?: string | null;
  churnRiskBand?: string | null;
  lifecycleStage?: string | null;
  productLinesBought?: string | null;
  isProMember?: boolean | null;
}

type Field = 'customerType' | 'regions' | 'states' | 'cities' | 'owners' | 'riskBands' | 'lifecycles' | 'productLines' | 'proOnly';
/** Multi-select slicers: a customer matches when its value is any of the picked ones. */
type ListField = Exclude<Field, 'customerType' | 'proOnly'>;

export interface FilterOptions {
  customerTypes: string[];
  regions: string[];
  states: string[];
  /** "City|ST" keys (the map's selection keys). */
  cities: string[];
  owners: string[];
  riskBands: string[];
  lifecycles: string[];
  productLines: string[];
}

const lines = (r: SlicerRow) => (r.productLinesBought ?? '').split('|').filter(Boolean);
const cityOf = (r: SlicerRow) => (r.city && r.state ? cityKey(r.city, r.state) : '');

/** Does a customer match every slicer except `skip`? */
function matches(r: SlicerRow, f: Filters, skip?: Field): boolean {
  if (skip !== 'customerType' && f.customerType !== 'all' && r.customerType !== f.customerType) return false;
  const any = (k: ListField, values: string[]) => skip === k || !f[k].length || values.some((v) => f[k].includes(v));
  if (!any('regions', [r.region ?? ''])) return false;
  if (!any('states', [r.state ?? ''])) return false;
  if (!any('cities', [cityOf(r)])) return false;
  if (!any('owners', [r.accountManager ?? ''])) return false;
  if (!any('riskBands', [r.churnRiskBand ?? ''])) return false;
  if (!any('lifecycles', [r.lifecycleStage ?? ''])) return false;
  if (!any('productLines', lines(r))) return false;
  if (skip !== 'proOnly' && f.proOnly && !r.isProMember) return false;
  return true;
}

function distinct(rows: SlicerRow[], f: Filters, skip: Field, pick: (r: SlicerRow) => (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (matches(r, f, skip)) for (const v of pick(r)) if (v) out.add(v);
  return out;
}

const sorted = (s: Set<string>) => [...s].sort();
const inOrder = (order: readonly string[], s: Set<string>) => order.filter((x) => s.has(x));

/** Options for every slicer, given the current selections of the others. */
export function filterOptions(rows: SlicerRow[], f: Filters): FilterOptions {
  return {
    customerTypes: inOrder(['Wholesale', 'Direct'], distinct(rows, f, 'customerType', (r) => [r.customerType])),
    regions: sorted(distinct(rows, f, 'regions', (r) => [r.region])),
    states: sorted(distinct(rows, f, 'states', (r) => [r.state])),
    cities: sorted(distinct(rows, f, 'cities', (r) => [cityOf(r)])),
    owners: sorted(distinct(rows, f, 'owners', (r) => [r.accountManager])),
    riskBands: inOrder(RISK_BANDS, distinct(rows, f, 'riskBands', (r) => [r.churnRiskBand])),
    lifecycles: inOrder(LIFECYCLE_STAGES, distinct(rows, f, 'lifecycles', (r) => [r.lifecycleStage])),
    productLines: sorted(distinct(rows, f, 'productLines', lines)),
  };
}

const FIELDS: Field[] = ['customerType', 'regions', 'states', 'cities', 'owners', 'riskBands', 'lifecycles', 'productLines', 'proOnly'];

function changed(a: Filters, b: Filters): Set<Field> {
  return new Set(FIELDS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])));
}

/**
 * Applies a slicer change and drops selections it made impossible. The slicers the user just changed are kept as
 * chosen; the others are re-added one at a time, coarse to fine, keeping only values that still have matching
 * customers (e.g. picking the West region removes a selected Texas). Without customer rows (still loading) the
 * change is applied as-is.
 */
export function applyFilterChange(rows: SlicerRow[], prev: Filters, next: Filters): Filters {
  if (!rows.length) return next;
  const keep = changed(prev, next);
  const f: Filters = { ...next };
  for (const k of FIELDS) if (!keep.has(k)) Object.assign(f, { [k]: ALL_FILTERS[k] });
  for (const k of FIELDS) {
    if (keep.has(k)) continue;
    const o = filterOptions(rows, f);
    const valid: Record<ListField, string[]> = {
      regions: o.regions, states: o.states, cities: o.cities, owners: o.owners,
      riskBands: o.riskBands, lifecycles: o.lifecycles, productLines: o.productLines,
    };
    if (k === 'proOnly') f.proOnly = next.proOnly && rows.some((r) => matches(r, f, 'proOnly') && r.isProMember);
    else if (k === 'customerType') {
      if (next.customerType !== 'all' && o.customerTypes.includes(next.customerType)) f.customerType = next.customerType;
    } else f[k] = next[k].filter((v) => valid[k].includes(v));
  }
  return changed(next, f).size ? f : next;
}
