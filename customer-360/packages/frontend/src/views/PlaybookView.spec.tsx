import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QueryState } from '@/hooks/use-query';
import type { MetricRow } from '@/lib/c360';

// Vega needs a real canvas / layout engine; the page logic is what is under test here.
vi.mock('@microsoft/fabric-visuals', () => ({ VegaVisual: () => <div data-testid="vega" />, useCssTheme: () => ({}) }));

import { PlaybookView } from './PlaybookView';

const rows = [
  { unifiedCustomerId: 'a', customerName: 'Acme Supply', customerType: 'Wholesale', accountManager: 'Ana Ruiz', nextBestAction: 'Resolve 2 high-priority ticket(s), then owner call', topChurnDriver: 'Service issues', revenueAtRisk: 10000, upsellValueEst: 0, netSalesTtm: 40000, returnsTtm: 1000, ordersTtm: 10, productLinesTtm: 3, churnRiskScore: 70, churnRiskBand: 'High' },
  { unifiedCustomerId: 'b', customerName: 'Bolt Hardware', customerType: 'Wholesale', accountManager: 'Ana Ruiz', nextBestAction: 'Pitch Hinges', topChurnDriver: 'Narrow product mix', topUpsellProductLine: 'Hinges', revenueAtRisk: 1000, upsellValueEst: 8000, netSalesTtm: 30000, returnsTtm: 0, ordersTtm: 8, productLinesTtm: 1, churnRiskScore: 10, churnRiskBand: 'Low' },
  { unifiedCustomerId: 'c', customerName: 'Cara Diaz', customerType: 'Direct', nextBestAction: 'Re-engage: no marketing response in 120 days', topChurnDriver: 'Disengaging', revenueAtRisk: 200, upsellValueEst: 100, netSalesTtm: 900, returnsTtm: 0, ordersTtm: 2, productLinesTtm: 1, churnRiskScore: 40, churnRiskBand: 'Medium' },
] as unknown as MetricRow[];

const q = (data: MetricRow[]): QueryState<MetricRow[]> => ({ status: 'success', data } as unknown as QueryState<MetricRow[]>);

describe('PlaybookView', () => {
  it('funds offers per owner and re-plans when a play is switched off', () => {
    const open = vi.fn();
    render(<PlaybookView metrics={q(rows)} onOpenCustomer={open} />);
    expect(screen.getByRole('heading', { name: 'Ana Ruiz' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'eCommerce marketing' })).toBeTruthy();
    expect(screen.getByText(/Bundle Hinges/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Acme Supply' }));
    expect(open).toHaveBeenCalledWith('a');

    fireEvent.click(screen.getByRole('button', { name: 'Service recovery' }));
    expect(screen.queryByRole('button', { name: 'Acme Supply' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bolt Hardware' })).toBeTruthy();
  });

  it('draws the why → what → who flow', () => {
    render(<PlaybookView metrics={q(rows)} onOpenCustomer={() => {}} />);
    expect(screen.getByRole('img', { name: /churn driver, play and owner/i })).toBeTruthy();
    expect(screen.getAllByText('Cross-sell bundle').length).toBeGreaterThan(0);
  });
});
