// Customer map: custom SVG (d3-geo + topojson-client) so cities can be selected by click, lasso or box.
// Vega-Lite's geo projections do not support drawn selections, which is why this visual is not a VegaVisual.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import usStates from 'us-atlas/states-10m.json';
import { Lasso, MousePointerClick, SquareDashed, X } from 'lucide-react';

import { Empty } from '@/components/ui';
import { useChartColors } from '@/lib/chart-colors';
import { cityLabel, rangeLabel, type CitySnapshot, type CityTotals, type Filters } from '@/lib/c360';
import { count, money, pct } from '@/lib/format';
import { cn } from '@/lib/utils';

const W = 960;
const H = 600;
const topo = usStates as unknown as Topology<{ states: GeometryCollection }>;
const STATES = feature(topo, topo.objects.states) as FeatureCollection;
const projection = geoAlbersUsa().fitSize([W, H], STATES);
const statePaths = STATES.features.map((f, i) => ({ id: String(f.id ?? i), d: geoPath(projection)(f) ?? '' }));

type MetricKey = 'sales' | 'orders' | 'returns' | 'returnRate' | 'tickets' | 'engagement' | 'customers' | 'risk' | 'churn' | 'highRisk' | 'upsell';
const METRICS: { key: MetricKey; label: string; range: boolean; fmt: (v: number) => string }[] = [
  { key: 'sales', label: 'Net sales', range: true, fmt: money },
  { key: 'orders', label: 'Orders', range: true, fmt: count },
  { key: 'returns', label: 'Returns ($)', range: true, fmt: money },
  { key: 'returnRate', label: 'Return rate', range: true, fmt: (v) => pct(v) },
  { key: 'tickets', label: 'Support tickets', range: true, fmt: count },
  { key: 'engagement', label: 'Marketing engagement rate', range: true, fmt: (v) => pct(v) },
  { key: 'customers', label: 'Customers', range: false, fmt: count },
  { key: 'risk', label: 'Revenue at risk', range: false, fmt: money },
  { key: 'churn', label: 'Average churn risk', range: false, fmt: (v) => v.toFixed(0) },
  { key: 'highRisk', label: 'High-risk customers', range: false, fmt: count },
  { key: 'upsell', label: 'Upsell opportunity', range: false, fmt: money },
];

interface Point extends Record<MetricKey, number> { key: string; city: string; state: string; x: number; y: number }
type Mode = 'click' | 'lasso' | 'box';

function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const v = m ? parseInt(m[1], 16) : 0x1c6fb8;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a); const [r2, g2, b2] = hexToRgb(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
};

/** Ray-casting point-in-polygon test in SVG coordinates. */
function inside(x: number, y: number, poly: [number, number][]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function CustomerMap({ snapshot, cities, filters, selected, onSelect }: {
  snapshot: CitySnapshot[]; cities: CityTotals[]; filters: Filters; selected: string[]; onSelect: (keys: string[]) => void;
}) {
  const c = useChartColors();
  const svgRef = useRef<SVGSVGElement>(null);
  const [metric, setMetric] = useState<MetricKey>('sales');
  const [mode, setMode] = useState<Mode>('click');
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];
  const sel = useMemo(() => new Set(selected), [selected]);

  const points = useMemo<Point[]>(() => {
    const totals = new Map(cities.map((t) => [`${t.city}|${t.state}`, t]));
    return snapshot.flatMap((s) => {
      const xy = projection([s.lon, s.lat]);
      if (!xy) return [];
      const t = totals.get(s.key);
      return [{
        key: s.key, city: s.city, state: s.state, x: xy[0], y: xy[1],
        customers: s.customers, risk: s.risk, churn: s.churn, upsell: s.upsell, highRisk: s.highRisk,
        sales: t?.netSales ?? 0, orders: t?.orders ?? 0, returns: t?.returns ?? 0, tickets: t?.tickets ?? 0,
        returnRate: t && t.netSales ? t.returns / t.netSales : 0, engagement: t && t.touches ? t.engagements / t.touches : 0,
      }];
    });
  }, [snapshot, cities]);

  const max = Math.max(...points.map((p) => p[metric]), 0);
  const radius = (v: number) => (max > 0 ? 5 + Math.sqrt(v / max) * 28 : 5);
  const fill = (v: number) => mix(c.series1Light, c.series1, max > 0 ? v / max : 0);
  const ranked = [...points].sort((a, b) => b[metric] - a[metric]);

  const toggle = (key: string) => onSelect(sel.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  const svgPoint = (e: ReactPointerEvent): [number, number] => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [pt.x, pt.y];
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === 'click') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft([svgPoint(e)]);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const p = svgPoint(e);
    setDraft(mode === 'box' ? [draft[0], p] : [...draft, p]);
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const poly: [number, number][] = mode === 'box' && draft.length === 2
      ? [draft[0], [draft[1][0], draft[0][1]], draft[1], [draft[0][0], draft[1][1]]]
      : draft;
    setDraft(null);
    if (poly.length < 3) return;
    const picked = points.filter((p) => inside(p.x, p.y, poly)).map((p) => p.key);
    // Shift adds to the current selection; otherwise the drawn area replaces it.
    onSelect(e.shiftKey ? [...new Set([...selected, ...picked])] : picked);
  };

  const draftPath = draft && draft.length > 1
    ? mode === 'box'
      ? `M${draft[0][0]},${draft[0][1]}H${draft[1][0]}V${draft[1][1]}H${draft[0][0]}Z`
      : `M${draft.map((p) => p.join(',')).join('L')}`
    : null;

  if (!points.length) return <Empty>No customers with a location match these filters.</Empty>;
  const modeBtn = (k: Mode, label: string, Icon: typeof Lasso) => (
    <button type="button" onClick={() => setMode(k)} aria-pressed={mode === k} title={label}
      className={cn('inline-flex items-center gap-100 rounded-md border px-200 py-100 text-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        mode === k ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}>
      <Icon aria-hidden className="icon-size-200" />{label}
    </button>
  );

  return (
    <div className="flex flex-col gap-300">
      <div className="flex flex-wrap items-center gap-200">
        <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Show</span>
        <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} aria-label="Map metric"
          className="rounded-md border border-input bg-card px-300 py-100 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <optgroup label={`For ${rangeLabel(filters.range)}`}>
            {METRICS.filter((x) => x.range).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </optgroup>
          <optgroup label="Current snapshot">
            {METRICS.filter((x) => !x.range).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </optgroup>
        </select>
        <span className="mx-100 h-400 w-px bg-border" aria-hidden />
        <div className="flex gap-100" role="group" aria-label="Selection mode">
          {modeBtn('click', 'Click', MousePointerClick)}
          {modeBtn('lasso', 'Lasso', Lasso)}
          {modeBtn('box', 'Box', SquareDashed)}
        </div>
        <span className="text-200 text-muted-foreground">
          {mode === 'click' ? 'Click cities to add or remove them.' : 'Drag to draw around cities; hold Shift to add to the selection.'}
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onSelect([])} aria-label="Clear the map selection"
            className="ml-auto inline-flex items-center gap-100 rounded-full bg-primary px-300 py-100 text-200 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {selected.length} {selected.length === 1 ? 'city' : 'cities'} selected<X aria-hidden className="icon-size-100" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-400 xl:grid-cols-[3fr_1fr]">
        <div className="relative">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of customers by city, sized by ${m.label}`}
            className={cn('h-auto w-full select-none touch-none', mode !== 'click' && 'cursor-crosshair')}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}>
            <g>
              {statePaths.map((s) => <path key={s.id} d={s.d} fill={c.border} fillOpacity={0.45} stroke={c.muted} strokeWidth={0.5} />)}
            </g>
            <g>
              {[...points].sort((a, b) => b[metric] - a[metric]).map((p) => {
                const on = sel.has(p.key);
                const dim = selected.length > 0 && !on;
                return (
                  <circle key={p.key} cx={p.x} cy={p.y} r={radius(p[metric])} fill={fill(p[metric])}
                    fillOpacity={dim ? 0.3 : 0.9} stroke={on ? c.series2 : 'white'} strokeWidth={on ? 3 : 1}
                    tabIndex={0} role="button" aria-pressed={on} aria-label={`${cityLabel(p.key)}: ${m.label} ${m.fmt(p[metric])}`}
                    className={cn('outline-none focus-visible:stroke-[color:var(--color-ring)]', mode === 'click' && 'cursor-pointer')}
                    onClick={() => mode === 'click' && toggle(p.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.key); } }}
                    onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} />
                );
              })}
            </g>
            {draftPath && <path d={draftPath} fill={c.series2} fillOpacity={0.12} stroke={c.series2} strokeWidth={2} strokeDasharray="6 4" />}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute rounded-md border border-border bg-popover px-300 py-200 text-200 text-popover-foreground shadow-lg"
              style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(12px, -110%)' }}>
              <div className="font-semibold">{cityLabel(hover.key)}</div>
              <div>{m.label}: <span className="tabular-nums">{m.fmt(hover[metric])}</span></div>
              <div className="text-muted-foreground">{count(hover.customers)} customers</div>
            </div>
          )}
          <div className="mt-200 flex items-center gap-200 text-200 text-muted-foreground" aria-hidden>
            <span>{m.fmt(0)}</span>
            <span className="h-200 w-[calc(var(--spacing-800)*5)] rounded-full" style={{ background: `linear-gradient(to right, ${c.series1Light}, ${c.series1})` }} />
            <span>{m.fmt(max)}</span>
            <span className="ml-200">{m.label} · bubble size and colour · {m.range ? rangeLabel(filters.range) : 'as of 28 Sep 2026'}</span>
          </div>
        </div>
        <ol className="flex flex-col divide-y divide-border text-300" aria-label={`Cities ranked by ${m.label}`}>
          {ranked.slice(0, 12).map((p, i) => (
            <li key={p.key} className="flex items-center justify-between gap-200 py-100">
              <label className="flex min-w-0 cursor-pointer items-center gap-200">
                <input type="checkbox" checked={sel.has(p.key)} onChange={() => toggle(p.key)} className="accent-[color:var(--color-primary)]" />
                <span className="min-w-0 truncate"><span className="mr-100 tabular-nums text-muted-foreground">{i + 1}.</span>{cityLabel(p.key)}</span>
              </label>
              <span className="shrink-0 tabular-nums">{m.fmt(p[metric])}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
