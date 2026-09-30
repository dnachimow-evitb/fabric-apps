import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ComboOption { value: string; label: string; hint?: string }

const FIELD = 'rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const MAX_RENDERED = 150;

interface BaseProps {
  label: string;
  options: ComboOption[];
  /** Label of the "no filter" choice; omit when a value is always required. */
  allLabel?: string;
  placeholder?: string;
  className?: string;
  widthClass?: string;
}
type SingleProps = BaseProps & { multiple?: false; value: string; onChange: (v: string) => void };
type MultiProps = BaseProps & { multiple: true; value: string[]; onChange: (v: string[]) => void };

/**
 * Searchable single- or multi-select dropdown used by every slicer.
 * Type to filter, arrow keys to move, Enter to choose, Escape to close; closes on outside click.
 */
export function Combobox(props: SingleProps | MultiProps) {
  const { label, options, allLabel, placeholder = 'Search…', className, widthClass } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = props.multiple ? props.value : [props.value];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    input.current?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : options;
    return list;
  }, [options, query]);
  const shown = matches.slice(0, MAX_RENDERED);
  // "All" row sits at index 0 when present and the search is empty.
  const showAll = !!allLabel && !query.trim();
  const rows = (showAll ? 1 : 0) + shown.length;

  const summary = props.multiple
    ? props.value.length === 0
      ? allLabel ?? 'None'
      : props.value.length <= 2 ? props.value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ') : `${props.value.length} selected`
    : options.find((o) => o.value === props.value)?.label ?? allLabel ?? props.value;

  const choose = (value: string | null) => {
    if (props.multiple) {
      if (value === null) props.onChange([]);
      else props.onChange(props.value.includes(value) ? props.value.filter((v) => v !== value) : [...props.value, value]);
    } else {
      props.onChange(value ?? 'all');
      setOpen(false);
      setQuery('');
    }
  };
  const chooseRow = (i: number) => {
    if (showAll && i === 0) choose(null);
    else { const o = shown[i - (showAll ? 1 : 0)]; if (o) choose(o.value); }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); chooseRow(active); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); }
  };

  return (
    <div ref={root} className={cn('relative flex flex-col gap-100', className)}>
      <span id={`${id}-label`} className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <button type="button" onClick={() => { setOpen(!open); setActive(0); }} aria-haspopup="listbox" aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={cn(FIELD, 'inline-flex items-center justify-between gap-200 text-left', widthClass ?? 'min-w-[calc(var(--spacing-800)*4.5)]')}>
        <span id={`${id}-value`} className="truncate">{summary}</span>
        <ChevronDown aria-hidden className="icon-size-200 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full z-40 mt-100 w-max min-w-full max-w-[calc(var(--spacing-800)*12)] rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-200 border-b border-border px-300 py-200">
            <Search aria-hidden className="icon-size-200 text-muted-foreground" />
            <input ref={input} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
              placeholder={placeholder} aria-label={`Search ${label}`} role="combobox" aria-expanded aria-controls={`${id}-list`}
              aria-activedescendant={rows ? `${id}-opt-${active}` : undefined}
              className="min-w-0 flex-1 bg-transparent text-300 outline-none placeholder:text-muted-foreground" />
          </div>
          <ul id={`${id}-list`} role="listbox" aria-multiselectable={props.multiple || undefined} aria-labelledby={`${id}-label`}
            className="max-h-[calc(var(--spacing-800)*9)] overflow-y-auto p-100">
            {showAll && (
              <li id={`${id}-opt-0`} role="option" aria-selected={selected.length === 0 || selected[0] === 'all'}
                onMouseDown={(e) => { e.preventDefault(); choose(null); }} onMouseEnter={() => setActive(0)}
                className={cn('flex cursor-pointer items-center gap-200 rounded-sm px-200 py-100 text-300', active === 0 && 'bg-accent')}>
                <span className="w-400">{(props.multiple ? props.value.length === 0 : props.value === 'all') && <Check aria-hidden className="icon-size-200" />}</span>
                <span className="font-semibold">{allLabel}</span>
              </li>
            )}
            {shown.map((o, i) => {
              const idx = i + (showAll ? 1 : 0);
              const on = selected.includes(o.value);
              return (
                <li key={o.value} id={`${id}-opt-${idx}`} role="option" aria-selected={on}
                  onMouseDown={(e) => { e.preventDefault(); choose(o.value); }} onMouseEnter={() => setActive(idx)}
                  className={cn('flex cursor-pointer items-center gap-200 rounded-sm px-200 py-100 text-300', active === idx && 'bg-accent')}>
                  <span className="w-400">{on && <Check aria-hidden className="icon-size-200" />}</span>
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto shrink-0 pl-300 text-200 text-muted-foreground">{o.hint}</span>}
                </li>
              );
            })}
            {matches.length === 0 && <li className="px-200 py-200 text-300 text-muted-foreground">No matches</li>}
            {matches.length > MAX_RENDERED && (
              <li className="px-200 py-100 text-200 text-muted-foreground">Showing {MAX_RENDERED} of {matches.length}. Keep typing to narrow.</li>
            )}
          </ul>
          {props.multiple && props.value.length > 0 && (
            <div className="flex justify-between border-t border-border px-300 py-200 text-200">
              <span className="text-muted-foreground">{props.value.length} selected</span>
              <button type="button" onClick={() => choose(null)} className="font-semibold underline-offset-4 hover:underline">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
