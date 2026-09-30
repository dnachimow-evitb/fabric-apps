// Growth Playbook: "we have an incentive budget - which customers get which offer, and what does it do to revenue?"
// Turns the per-customer scores into a budget-constrained commercial plan (lib/playbook.ts) and shows what it does to
// next year's revenue and to the business drivers: customers kept, product lines per customer, return rate.
// Every lever re-plans instantly in the browser; no queries beyond gold_customer_metrics.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { Download, Layers, PackageCheck, Rocket, Sparkles, TrendingUp, UserCheck } from 'lucide-react';

import { Card, Empty, Loaded, RiskBadge, Skeleton } from '@/components/ui';
import type { QueryState } from '@/hooks/use-query';
import { useChartColors } from '@/lib/chart-colors';
import type { MetricRow } from '@/lib/c360';
import { count, money, pct } from '@/lib/format';
import {
  DEFAULT_LEVERS, ECOMMERCE, PLAYS, flows, fullCost, gainCurve, plan, planCsv,
  type Candidate, type Flow, type Levers, type Plan, type PlayId,
} from '@/lib/playbook';
import { cn } from '@/lib/utils';

/** Extra budget the "what would more money buy" line prices. */
const BUDGET_STEP = 25000;
/** Opening slice of spend the value curve reports the return for. */
const FIRST_SLICE = 10000;

export function PlaybookView({ metrics, onOpenCustomer }: { metrics: QueryState<MetricRow[]>; onOpenCustomer: (id: string) => void }) {
  return (
    <Loaded q={metrics} skeleton={<div className="flex flex-col gap-400"><Skeleton className="h-[calc(var(--spacing-800)*7)]" /><Skeleton className="h-[calc(var(--spacing-800)*12)]" /></div>}>
      {(rows) => rows.length ? <Playbook rows={rows} onOpenCustomer={onOpenCustomer} /> : <Empty>No customers match these filters.</Empty>}
    </Loaded>
  );
}

function Playbook({ rows, onOpenCustomer }: { rows: MetricRow[]; onOpenCustomer: (id: string) => void }) {
  const [lv, setLv] = useState<Levers>(DEFAULT_LEVERS);
  const p = useMemo(() => plan(rows, lv), [rows, lv]);
  // What another slice of budget would be worth: the "ask" for the boss.
  const more = useMemo(() => plan(rows, { ...lv, budget: lv.budget + BUDGET_STEP }), [rows, lv]);
  const extra = more.net - p.net;
  const maxBudget = Math.max(BUDGET_STEP, Math.ceil(fullCost(p.candidates) / 10000) * 10000);
  const highRisk = rows.filter((r) => r.churnRiskBand === 'High').length;

  return (
    <div className="flex flex-col gap-400">
      <Hero p={p} lv={lv} extra={extra} highRisk={highRisk} />

      <div className="grid grid-cols-1 gap-400 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Levers" subtitle="Set the budget and the bar each offer must clear. The plan re-optimises instantly.">
          <LeverPanel lv={lv} maxBudget={maxBudget} onChange={setLv} />
        </Card>
        <Card className="lg:col-span-8" title="Next 12 months: revenue bridge"
          subtitle="Last year's net sales, less the churn we expect if nothing changes, plus what the plan keeps, wins and saves in returns, less the cost of the offers.">
          <Bridge p={p} />
        </Card>

        <Card className="lg:col-span-5" title="Where the money works"
          subtitle="Value returned as more budget goes in, best return first. The first dollars work hardest.">
          {p.candidates.length ? <GainCurve p={p} lv={lv} /> : <Empty>No offers for the selected plays.</Empty>}
        </Card>
        <Card className="lg:col-span-7" title="Why → what → who"
          subtitle="Plan value flowing from each customer's top churn driver, to the play that addresses it, to the team that runs it.">
          {p.selected.length ? <Sankey selected={p.selected} /> : <Empty>Nothing is funded at this budget.</Empty>}
        </Card>

        <Card className="lg:col-span-12" title="Who does what"
          subtitle="Funded offers by owner, best return first. Account managers run the wholesale offers; eCommerce marketing runs the direct ones as campaigns."
          action={(
            <button type="button" onClick={() => downloadCsv(p)} disabled={!p.selected.length}
              className="inline-flex items-center gap-100 rounded-md bg-primary px-300 py-200 font-heading text-200 font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <Download aria-hidden className="icon-size-200" />Export plan (CSV)
            </button>
          )}>
          <OwnerPlans p={p} onOpenCustomer={onOpenCustomer} />
        </Card>

        <Card className="lg:col-span-12" title="How the plan is built"
          subtitle="Planning assumptions, not model outputs. Tune them with the response lever; replace them with measured redemption and win rates once offers are tracked.">
          <Assumptions lv={lv} />
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Hero

/** Eases a number to its new value (skipped when the user prefers reduced motion). */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = current.current;
    const start = performance.now();
    let id = 0;
    const tick = (t: number) => {
      const k = reduce ? 1 : Math.min(1, (t - start) / ms);
      const next = from + (target - from) * (1 - Math.pow(1 - k, 3));
      current.current = next;
      setV(next);
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return v;
}

function Hero({ p, lv, extra, highRisk }: { p: Plan; lv: Levers; extra: number; highRisk: number }) {
  const shown = useCountUp(p.net);
  const gross = p.save + p.upsell + p.returnsAvoided;
  const roi = p.spend ? gross / p.spend : 0;
  return (
    <section className="overflow-hidden rounded-lg border-t-4 border-primary bg-[color:var(--color-header)] p-600 text-[color:var(--color-header-foreground)]" aria-labelledby="playbook-title">
      <div className="grid grid-cols-1 gap-600 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-300">
          <p className="flex items-center gap-100 font-heading text-200 font-semibold uppercase tracking-widest opacity-70">
            <Rocket aria-hidden className="icon-size-200" />Growth Playbook · next 12 months · net of offer costs
          </p>
          <h2 id="playbook-title" className="sr-only">Growth Playbook</h2>
          <div className="font-[family-name:var(--font-numeric)] text-hero-1000 font-semibold leading-hero-1000 tabular-nums" aria-live="polite">
            {p.net >= 0 ? '+' : '−'}{money(Math.abs(shown))}
          </div>
          <p className="max-w-[60ch] text-400 opacity-90">
            Put <strong>{money(p.spend)}</strong> of the {money(lv.budget)} budget into targeted rebates, coupons and bundles for{' '}
            <strong>{count(p.selected.length)} customers</strong> to keep <strong>{money(p.save)}</strong> of at-risk revenue,
            win <strong>{money(p.upsell)}</strong> in new product lines and avoid <strong>{money(p.returnsAvoided)}</strong> of returns.
          </p>
          {extra > 0 && (
            <p className="flex items-start gap-200 rounded-md bg-white/10 p-300 text-300">
              <Sparkles aria-hidden className="icon-size-200 mt-100 shrink-0 text-[color:var(--color-primary)]" />
              <span>Another {money(BUDGET_STEP)} of budget would add <strong>{money(extra)}</strong> net.</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-300 self-end md:grid-cols-4">
          <HeroStat icon={<TrendingUp aria-hidden className="icon-size-200" />} label="Return on spend" value={`${roi.toFixed(1)}×`}
            detail={`${money(gross)} back on ${money(p.spend)}`} />
          <HeroStat icon={<UserCheck aria-hidden className="icon-size-200" />} label="Customers kept" value={`+${count(p.kept)}`}
            detail={`expected, from ${count(p.selected.length)} offers (${count(highRisk)} customers at high risk)`} />
          <HeroStat icon={<Layers aria-hidden className="icon-size-200" />} label="Lines / customer" value={p.after.linesPerCustomer.toFixed(2)}
            detail={`from ${p.before.linesPerCustomer.toFixed(2)} today`} />
          <HeroStat icon={<PackageCheck aria-hidden className="icon-size-200" />} label="Return rate" value={pct(p.after.returnRate)}
            detail={`from ${pct(p.before.returnRate)} today`} />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/15 p-300">
      <div className="flex items-center gap-100 font-heading text-100 font-semibold uppercase tracking-wider opacity-70">{icon}{label}</div>
      <div className="mt-100 font-[family-name:var(--font-numeric)] text-hero-700 font-semibold leading-hero-700">{value}</div>
      <div className="text-200 opacity-70">{detail}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Levers

function Slider({ label, hint, value, min, max, step, format, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-100">
      <span className="flex items-baseline justify-between gap-200">
        <span className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <output className="font-[family-name:var(--font-numeric)] text-400 font-semibold">{format(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-primary)]" />
      {hint && <span className="text-200 text-muted-foreground">{hint}</span>}
    </label>
  );
}

function LeverPanel({ lv, maxBudget, onChange }: { lv: Levers; maxBudget: number; onChange: (l: Levers) => void }) {
  const set = (patch: Partial<Levers>) => onChange({ ...lv, ...patch });
  const toggle = (id: PlayId) => set({ plays: lv.plays.includes(id) ? lv.plays.filter((x) => x !== id) : [...lv.plays, id] });
  return (
    <div className="flex flex-col gap-400">
      <Slider label="Incentive budget" hint={`Funding every offer would cost ${money(maxBudget)}.`} value={Math.min(lv.budget, maxBudget)}
        min={0} max={maxBudget} step={maxBudget > 100000 ? 5000 : 1000} format={money} onChange={(v) => set({ budget: v })} />
      <Slider label="Minimum return" hint="Only fund offers that return at least this multiple of their cost." value={lv.minRoi}
        min={1} max={10} step={0.5} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set({ minRoi: v })} />
      <Slider label="Customer response" hint="Scales every keep, win and returns rate. 100% = the assumptions below." value={lv.response}
        min={0.5} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ response: v })} />
      <fieldset className="flex flex-col gap-200">
        <legend className="mb-200 font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Plays in the plan</legend>
        <div className="flex flex-wrap gap-200">
          {PLAYS.map((pl) => {
            const on = lv.plays.includes(pl.id);
            return (
              <button key={pl.id} type="button" aria-pressed={on} onClick={() => toggle(pl.id)} title={pl.offer}
                className={cn('rounded-full border px-300 py-100 text-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground line-through hover:bg-accent')}>
                {pl.id}
              </button>
            );
          })}
        </div>
      </fieldset>
      <button type="button" onClick={() => onChange(DEFAULT_LEVERS)}
        className="self-start text-200 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Reset levers
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Charts

function statusColors() {
  const s = getComputedStyle(document.documentElement);
  return { good: s.getPropertyValue('--color-status-good').trim() || '#2b8a3e', bad: s.getPropertyValue('--color-status-critical').trim() || '#c92a2a' };
}

function Bridge({ p }: { p: Plan }) {
  const theme = useCssTheme();
  const c = useChartColors();
  const st = statusColors();
  const noAction = p.baseline - p.atRisk;
  const a = noAction + p.save;
  const b = a + p.upsell;
  const d = b + p.returnsAvoided;
  const withPlan = d - p.spend;
  const steps: [string, number, number, string][] = [
    ['Last 12 mo', 0, p.baseline, 'Total'],
    ['Churn', p.baseline, noAction, 'Loss'],
    ['No action', 0, noAction, 'Outlook'],
    ['Kept', noAction, a, 'Gain'],
    ['Upsell', a, b, 'Gain'],
    ['Returns', b, d, 'Gain'],
    ['Offers', d, withPlan, 'Loss'],
    ['With plan', 0, withPlan, 'Total'],
  ];
  const data: DataTable = {
    columns: [{ name: 'step', displayName: 'Step' }, { name: 'start' }, { name: 'end' }, { name: 'kind', displayName: 'Kind' },
      { name: 'amount', displayName: 'Amount', format: '$#,0' }, { name: 'label' }, { name: 'top' }],
    // labels sit above the taller end of each bar, so a loss label is not drawn inside its bar
    rows: steps.map(([s, x, y, k]) => [s, x, y, k, y - x, `${k === 'Loss' ? '−' : k === 'Gain' ? '+' : ''}${money(Math.abs(y - x))}`, Math.max(x, y)]),
  };
  const spec: VisualizationSpec = {
    encoding: { x: { field: 'step', type: 'nominal', sort: null, title: null, axis: { labelAngle: 0, labelOverlap: false } } },
    layer: [
      {
        mark: { type: 'bar', cornerRadius: 2 },
        encoding: {
          y: { field: 'start', type: 'quantitative', title: 'Net sales', axis: { format: '$~s' } },
          y2: { field: 'end' },
          color: { field: 'kind', type: 'nominal', legend: null,
            scale: { domain: ['Total', 'Loss', 'Outlook', 'Gain'], range: [c.series1, st.bad, c.muted, st.good] } },
          tooltip: [{ field: 'step' }, { field: 'amount' }],
        },
      },
      { mark: { type: 'text', dy: -8, fontWeight: 600 }, encoding: { y: { field: 'top', type: 'quantitative' }, text: { field: 'label' } } },
    ],
  };
  return (
    <>
      <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 10)' }} />
      <p className="mt-200 text-200 text-muted-foreground">
        Churn is the sum of each customer's revenue at risk (12-month sales × churn risk score). Returns avoided are refunds not paid out.
        The plan turns <strong className="text-foreground">{money(noAction)}</strong> into <strong className="text-foreground">{money(withPlan)}</strong> after{' '}
        {money(p.spend)} of offers.
      </p>
    </>
  );
}

function GainCurve({ p, lv }: { p: Plan; lv: Levers }) {
  const budget = lv.budget;
  const theme = useCssTheme();
  const c = useChartColors();
  const curve = useMemo(() => gainCurve(p.candidates), [p.candidates]);
  const total = curve[curve.length - 1]?.value ?? 0;
  const all = curve[curve.length - 1]?.spend ?? 0;
  // How hard the first dollars work, and what the next unfunded offer would return.
  const first = curve.find((pt) => pt.spend >= FIRST_SLICE) ?? curve[curve.length - 1];
  const funded = new Set(p.selected);
  const next = p.candidates.find((c) => !funded.has(c));
  const data: DataTable = {
    columns: [{ name: 'spend', displayName: 'Incentive spend, best return first', format: '$#,0' }, { name: 'value', displayName: 'Value returned', format: '$#,0' },
      { name: 'customers', displayName: 'Customers', format: '#,0' }],
    rows: curve.map((pt) => [pt.spend, pt.value, pt.customers]),
  };
  const x = Math.min(budget, all);
  const spec: VisualizationSpec = {
    layer: [
      { mark: { type: 'area', color: c.series1, opacity: 0.15 }, encoding: { x: { field: 'spend', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' } } },
      {
        mark: { type: 'line', color: c.series1, strokeWidth: 2 },
        encoding: {
          x: { field: 'spend', type: 'quantitative' },
          y: { field: 'value', type: 'quantitative' },
          tooltip: [{ field: 'spend' }, { field: 'customers' }, { field: 'value' }],
        },
      },
      { mark: { type: 'rule', color: c.series2, strokeDash: [4, 3], strokeWidth: 2 }, encoding: { x: { datum: x } } },
      {
        mark: { type: 'text', color: c.series2, align: 'left', dx: 6, fontWeight: 600 },
        encoding: { x: { datum: x }, y: { datum: total * 0.08 }, text: { value: `Your budget: ${money(budget)}` } },
      },
    ],
  };
  return (
    <>
      <VegaVisual spec={spec} data={data} theme={theme} style={{ height: 'calc(var(--spacing-800) * 10)' }} />
      <p className="mt-200 text-200 text-muted-foreground">
        The first <strong className="text-foreground">{money(first.spend)}</strong> returns{' '}
        <strong className="text-foreground">{(first.spend ? first.value / first.spend : 0).toFixed(1)}×</strong>
        {' '}(funding every offer averages {(all ? total / all : 0).toFixed(1)}×).{' '}
        {next
          ? next.roi >= lv.minRoi
            ? <>The next offer beyond your budget would still return <strong className="text-foreground">{next.roi.toFixed(1)}×</strong>, above your {lv.minRoi.toFixed(1)}× bar, so more budget pays.</>
            : <>The next offer would return only {next.roi.toFixed(1)}×, below your {lv.minRoi.toFixed(1)}× bar: more budget won't be spent unless you lower it.</>
          : <>Every offer is funded.</>}
      </p>
    </>
  );
}

// Sankey: a small custom layout (three columns) drawn as SVG bands.
const SW = 900;
const SH = 420;
const NODE_W = 12;
const PAD = 10;

interface SNode { name: string; col: number; value: number; y: number; h: number }
interface SLink { source: SNode; target: SNode; value: number; sy: number; ty: number; w: number; grow: boolean }

const GROW_PLAY: PlayId = 'Cross-sell bundle';

function layoutSankey(stage1: Flow[], stage2: Flow[]) {
  const cols: Map<string, SNode>[] = [new Map(), new Map(), new Map()];
  const node = (col: number, name: string) => {
    const m = cols[col];
    if (!m.has(name)) m.set(name, { name, col, value: 0, y: 0, h: 0 });
    return m.get(name)!;
  };
  for (const f of stage1) { node(0, f.source).value += f.value; node(1, f.target).value += f.value; }
  for (const f of stage2) node(2, f.target).value += f.value;
  const total = [...cols[0].values()].reduce((s, x) => s + x.value, 0) || 1;
  const k = Math.min(...cols.map((m) => (SH - PAD * Math.max(0, m.size - 1)) / total));
  const ordered = cols.map((m) => [...m.values()].sort((a, b) => b.value - a.value));
  for (const list of ordered) {
    let y = 0;
    for (const nd of list) { nd.h = Math.max(1, nd.value * k); nd.y = y; y += nd.h + PAD; }
  }
  const out = new Map<SNode, number>(); const inn = new Map<SNode, number>();
  const links: SLink[] = [];
  const build = (flowsList: Flow[], sc: number) => {
    const ls = flowsList.map((f) => ({ source: cols[sc].get(f.source)!, target: cols[sc + 1].get(f.target)!, value: f.value }));
    ls.sort((a, b) => a.source.y - b.source.y || a.target.y - b.target.y);
    for (const l of ls) {
      const w = l.value * k;
      const sy = l.source.y + (out.get(l.source) ?? 0); out.set(l.source, (out.get(l.source) ?? 0) + w);
      links.push({ ...l, sy, ty: 0, w, grow: (sc === 0 ? l.target.name : l.source.name) === GROW_PLAY });
    }
    // incoming offsets ordered by source position
    const mine = links.slice(links.length - ls.length).sort((a, b) => a.target.y - b.target.y || a.source.y - b.source.y);
    for (const l of mine) { l.ty = l.target.y + (inn.get(l.target) ?? 0); inn.set(l.target, (inn.get(l.target) ?? 0) + l.w); }
  };
  build(stage1, 0);
  build(stage2, 1);
  return { nodes: ordered.flat(), links, height: Math.max(...ordered.map((l) => (l.length ? l[l.length - 1].y + l[l.length - 1].h : 0))) };
}

const COL_X = [170, SW / 2 - NODE_W / 2, SW - 170 - NODE_W];

function Sankey({ selected }: { selected: Candidate[] }) {
  const c = useChartColors();
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, links, height } = useMemo(() => {
    const f = flows(selected);
    return layoutSankey(f.stage1, f.stage2);
  }, [selected]);
  const lit = (l: SLink) => !hover || l.source.name === hover || l.target.name === hover;
  const band = (l: SLink) => {
    const x0 = COL_X[l.source.col] + NODE_W; const x1 = COL_X[l.target.col]; const xm = (x0 + x1) / 2;
    return `M${x0},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${x1},${l.ty} L${x1},${l.ty + l.w} C${xm},${l.ty + l.w} ${xm},${l.sy + l.w} ${x0},${l.sy + l.w} Z`;
  };
  return (
    <div>
      <div className="mb-200 flex flex-wrap items-center gap-400 text-200 text-muted-foreground">
        <span className="flex items-center gap-100"><span aria-hidden className="inline-block size-200 rounded-sm" style={{ background: c.series1 }} />Protect (retention plays)</span>
        <span className="flex items-center gap-100"><span aria-hidden className="inline-block size-200 rounded-sm" style={{ background: c.series2 }} />Grow (cross-sell)</span>
        <span className="ml-auto">Hover a bar to trace it</span>
      </div>
      <svg viewBox={`-4 -24 ${SW + 8} ${height + 32}`} className="w-full" role="img"
        aria-label="Plan value by churn driver, play and owner" onMouseLeave={() => setHover(null)}>
        {['Churn driver', 'Play', 'Owner'].map((t, i) => (
          <text key={t} x={i === 0 ? COL_X[0] + NODE_W : i === 2 ? COL_X[2] : COL_X[1] + NODE_W / 2} y={-10}
            textAnchor={i === 0 ? 'end' : i === 2 ? 'start' : 'middle'} fontSize={12} fontWeight={600} fill={c.muted}
            style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{t}</text>
        ))}
        {links.map((l, i) => (
          <path key={i} d={band(l)} fill={l.grow ? c.series2 : c.series1} fillOpacity={lit(l) ? (hover ? 0.55 : 0.3) : 0.06}
            style={{ transition: 'fill-opacity 150ms' }}>
            <title>{`${l.source.name} → ${l.target.name}: ${money(l.value)}`}</title>
          </path>
        ))}
        {nodes.map((nd) => {
          const x = COL_X[nd.col];
          const right = nd.col !== 0;
          return (
            <g key={`${nd.col}-${nd.name}`} onMouseEnter={() => setHover(nd.name)} style={{ cursor: 'default' }}>
              <rect x={x} y={nd.y} width={NODE_W} height={nd.h} rx={2} fill="currentColor" className="text-foreground"
                opacity={!hover || hover === nd.name ? 1 : 0.35} />
              <text x={right ? x + NODE_W + 6 : x - 6} y={nd.y + nd.h / 2} dy="0.35em" textAnchor={right ? 'start' : 'end'}
                fontSize={12} fill="currentColor" className="text-foreground">
                <tspan fontWeight={600}>{nd.name}</tspan><tspan fill={c.muted}>{`  ${money(nd.value)}`}</tspan>
              </text>
              <title>{`${nd.name}: ${money(nd.value)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Plans per owner

function OwnerPlans({ p, onOpenCustomer }: { p: Plan; onOpenCustomer: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? p.owners : p.owners.slice(0, 8);
  if (!p.owners.length) return <Empty>Nothing is funded: raise the budget or lower the minimum return.</Empty>;
  return (
    <div className="flex flex-col gap-300">
      <div className="grid grid-cols-1 gap-300 md:grid-cols-2 xl:grid-cols-4">
        {shown.map((o) => {
          const share = p.spend ? o.spend / p.spend : 0;
          return (
            <article key={o.owner} className="flex min-w-0 flex-col gap-200 rounded-md border border-border bg-background p-300">
              <header className="flex items-baseline justify-between gap-200">
                <h3 className="truncate font-heading text-300 font-semibold uppercase tracking-wider">{o.owner}</h3>
                <span className="font-[family-name:var(--font-numeric)] text-400 font-semibold">{money(o.value)}</span>
              </header>
              <div>
                <div className="h-100 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[color:var(--color-series-1)] transition-[width] duration-500" style={{ width: `${share * 100}%` }} />
                </div>
                <div className="mt-100 flex justify-between gap-200 text-200 text-muted-foreground">
                  <span>{money(o.spend)} of offers · {(o.spend ? o.value / o.spend : 0).toFixed(1)}×</span>
                  <span>{count(o.actions.length)} {o.owner === ECOMMERCE ? 'campaign targets' : 'accounts'}</span>
                </div>
              </div>
              <ol className="flex flex-col divide-y divide-border">
                {o.actions.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-200 py-100">
                    <div className="min-w-0">
                      <button type="button" onClick={() => onOpenCustomer(a.id)}
                        className="block max-w-full truncate text-left text-300 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {a.name}
                      </button>
                      <div className="truncate text-200 text-muted-foreground" title={a.action}>
                        {a.play === GROW_PLAY && a.upsellLine ? `Bundle ${a.upsellLine}` : a.play} · {money(a.cost)} offer
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-100">
                      <span className="text-200 font-semibold tabular-nums">{money(a.value)}</span>
                      {a.band && <RiskBadge band={a.band} />}
                    </div>
                  </li>
                ))}
              </ol>
              {o.actions.length > 5 && <p className="text-200 text-muted-foreground">+ {count(o.actions.length - 5)} more in the export</p>}
            </article>
          );
        })}
      </div>
      {p.owners.length > 8 && (
        <button type="button" onClick={() => setAll(!all)}
          className="self-start text-200 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {all ? 'Show top 8 owners' : `Show all ${p.owners.length} owners`}
        </button>
      )}
    </div>
  );
}

function downloadCsv(p: Plan) {
  const blob = new Blob([planCsv(p)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `growth-playbook-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------------------------
// Assumptions

function Assumptions({ lv }: { lv: Levers }) {
  const TH = 'px-300 py-200 text-left font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground';
  const TD = 'px-300 py-200 align-top';
  const r = (x: number) => pct(Math.min(1, x * lv.response), 0);
  return (
    <div className="grid grid-cols-1 gap-500 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-300">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Play and offer</th><th className={TH}>Triggered by</th>
              <th className={cn(TH, 'text-right')}>Keeps</th><th className={cn(TH, 'text-right')}>Wins</th><th className={cn(TH, 'text-right')}>Cuts returns</th>
            </tr>
          </thead>
          <tbody>
            {PLAYS.map((pl) => (
              <tr key={pl.id} className="border-b border-border last:border-0">
                <td className={TD}>
                  <div className="font-semibold">{pl.id}</div>
                  <div className="text-200">{pl.offer}</div>
                  <div className="text-200 text-muted-foreground">{pl.what}</div>
                </td>
                <td className={cn(TD, 'text-200')}>{pl.trigger}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{r(pl.save)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{r(pl.win)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{pl.returnsCut ? r(pl.returnsCut) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex list-disc flex-col gap-200 pl-400 text-300">
        <li><strong>Value</strong> = keep rate × revenue at risk + win rate × upsell opportunity + returns cut × 12-month returns, all from <code className="font-mono text-200">gold_customer_metrics</code>.</li>
        <li><strong>Cost</strong> = the offer: a share of the customer's 12-month spend, or of the upsell for a bundle discount (at least $10).</li>
        <li><strong>Funding</strong>: offers are ranked by return on spend (value ÷ cost) and funded until the budget runs out or the return falls below the minimum.</li>
        <li><strong>Drivers</strong>: customers kept = keep rate × churn probability; each won cross-sell adds a product line; returns avoided lower the return rate.</li>
        <li>Customers whose next best action is "Maintain cadence" get no offer. The plan follows the page filters, so you can plan one region, owner or channel at a time.</li>
      </ul>
    </div>
  );
}
