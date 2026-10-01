import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ALL_FILTERS, presetRange } from '@/lib/c360';
import type { FilterOptions } from '@/lib/filter-options';

import { FilterBar } from './FilterBar';

const options: FilterOptions = {
  customerTypes: ['Wholesale', 'Direct'], regions: ['South', 'West'], states: [], cities: [], owners: [],
  riskBands: ['High', 'Low'], lifecycles: [], productLines: ['Locks', 'Tools'],
};

describe('Clear all filters', () => {
  it('is disabled when nothing is filtered', () => {
    render(<FilterBar filters={ALL_FILTERS} onChange={vi.fn()} options={options} />);
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeDisabled();
  });

  it('resets every slicer and the period', () => {
    const onChange = vi.fn();
    const filters = { ...ALL_FILTERS, regions: ['West', 'South'], productLines: ['Locks'], range: presetRange('ytd') };
    render(<FilterBar filters={filters} onChange={onChange} options={options} />);
    expect(screen.getByRole('button', { name: 'Remove filter West' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    expect(onChange).toHaveBeenCalledWith(ALL_FILTERS);
  });

  it('counts a changed period as something to clear', () => {
    render(<FilterBar filters={{ ...ALL_FILTERS, range: presetRange('cal2025') }} onChange={vi.fn()} options={options} />);
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeEnabled();
  });
});
