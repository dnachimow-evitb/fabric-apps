import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { Combobox, type ComboOption } from './Combobox';

const STATES: ComboOption[] = ['AZ', 'CA', 'CO', 'FL', 'GA', 'TX'].map((s) => ({ value: s, label: s }));

function Single({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState('all');
  return <Combobox label="Region" value={v} allLabel="All regions" options={STATES} onChange={(x) => { setV(x); onChange(x); }} />;
}

function Multi({ onChange }: { onChange: (v: string[]) => void }) {
  const [v, setV] = useState<string[]>([]);
  return <Combobox multiple label="State" value={v} allLabel="All states" options={STATES} onChange={(x) => { setV(x); onChange(x); }} />;
}

describe('Combobox', () => {
  it('filters options as you type and picks one with the keyboard', () => {
    const onChange = vi.fn();
    render(<Single onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /region/i }));
    const search = screen.getByRole('combobox', { name: 'Search Region' });
    fireEvent.change(search, { target: { value: 'c' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['CA', 'CO']);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('CO');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows a no-matches message', () => {
    render(<Single onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /region/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('toggles several values in multi-select mode and clears them', () => {
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /state/i }));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'CA' }));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'TX' }));
    expect(onChange).toHaveBeenLastCalledWith(['CA', 'TX']);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'CA' }));
    expect(onChange).toHaveBeenLastCalledWith(['TX']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
