// Animated customer journey: a figure walks a 24-month timeline and acts out what the customer did each month
// (opens an email, buys, throws a return in the bin, stomps about a support ticket). Script and clock live in
// lib/journey.ts; this file only draws a frame. It never autoplays.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import type { CustomerMonthRow } from '@/lib/c360';
import { count, money } from '@/lib/format';
import {
  buildJourney, finaleFor, frameAt, journeyMonths, monthUnder, narrate, schedule, type Finale, type Frame, type Schedule, type Stop,
} from '@/lib/journey';
import { cn } from '@/lib/utils';

const VW = 1000;
const VH = 290;
const X0 = 40;
const X1 = 960;
const GROUND = 225;
const SPEEDS = [1, 2, 4] as const;

const BUTTON = 'inline-flex items-center gap-100 rounded-md border border-border px-300 py-100 text-300 font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const ICON: Record<string, string> = { email: '✉️', buy: '📦', return: '🗑️', stomp: '💢' };

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

export function CustomerJourney({ rows, name, customerType, lifecycle, riskBand }: {
  rows: CustomerMonthRow[]; name: string; customerType: string | null | undefined;
  lifecycle: string | null | undefined; riskBand: string | null | undefined;
}) {
  const stops = useMemo(() => buildJourney(rows), [rows]);
  const sched = useMemo(() => schedule(stops), [stops]);
  const finale = finaleFor(lifecycle, riskBand);
  // Clock: while playing, t = anchor.t + elapsed × speed; requestAnimationFrame only advances `now`.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [anchor, setAnchor] = useState({ wall: 0, t: 0 });
  const [now, setNow] = useState(0);
  const t = Math.min(sched.total, playing ? anchor.t + ((now - anchor.wall) / 1000) * speed : anchor.t);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const wall = performance.now();
      if (anchor.t + ((wall - anchor.wall) / 1000) * speed >= sched.total) {
        setAnchor({ wall: 0, t: sched.total });
        setPlaying(false);
        return;
      }
      setNow(wall);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, anchor, speed, sched.total]);

  const ended = t >= sched.total;
  // `wall` is the event's timeStamp: the same clock as performance.now() in the animation loop.
  const seek = (wall: number, to: number, play: boolean) => {
    setAnchor({ wall, t: to });
    setNow(wall);
    setPlaying(play);
  };
  const toggle = (wall: number) => (playing ? seek(wall, t, false) : seek(wall, ended ? 0 : t, true));
  const changeSpeed = (wall: number, s: (typeof SPEEDS)[number]) => { seek(wall, t, playing); setSpeed(s); };

  const f = frameAt(sched, t);
  const caption = narrate(f, finale, stops);
  const totals = stops.reduce((a, s) => {
    for (const x of s.acts) a[x.kind] += x.count;
    return a;
  }, { email: 0, buy: 0, return: 0, stomp: 0 });

  return (
    <div className="flex flex-col gap-300">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full select-none rounded-md bg-muted/40" role="img"
        aria-label={`Animated journey of ${name} over 24 months: ${count(totals.buy)} orders, ${count(totals.return)} returns, ${count(totals.stomp)} support tickets, ${count(totals.email)} email opens or clicks.`}>
        <Track stops={stops} sched={sched} t={t} />
        <Walker f={f} stops={stops} business={customerType === 'Wholesale'} finale={finale} />
      </svg>

      <p aria-live="polite" className="min-h-[1.5em] text-300 font-semibold">{caption}</p>

      <div className="flex flex-wrap items-center gap-300">
        <button type="button" onClick={(e) => toggle(e.timeStamp)} className={cn(BUTTON, 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90')}>
          {playing ? <Pause aria-hidden className="icon-size-200" /> : <Play aria-hidden className="icon-size-200" />}
          {playing ? 'Pause' : ended ? 'Play again' : t > 0 ? 'Resume' : 'Play journey'}
        </button>
        <button type="button" onClick={(e) => seek(e.timeStamp, 0, playing)} className={BUTTON} disabled={t === 0}>
          <RotateCcw aria-hidden className="icon-size-200" />Restart
        </button>
        <div className="inline-flex rounded-md border border-border p-100" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={(e) => changeSpeed(e.timeStamp, s)}
              className={cn('rounded-md px-200 py-[2px] text-200 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                speed === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
              {s}×
            </button>
          ))}
        </div>
        <label className="flex min-w-[calc(var(--spacing-800)*6)] flex-1 items-center gap-200 text-200 text-muted-foreground">
          <span className="sr-only">Position in the journey</span>
          <input type="range" min={0} max={sched.total} step={0.05} value={t}
            onChange={(e) => seek(e.timeStamp, Number(e.target.value), false)}
            className="w-full accent-[color:var(--color-primary)]" />
        </label>
      </div>

      <p className="text-200 text-muted-foreground">
        Acted out from monthly totals (gold_customer_monthly): {count(totals.buy)} orders, {count(totals.return)} returns,{' '}
        {count(totals.stomp)} support tickets, {count(totals.email)} campaign email opens or clicks. Days within a month aren't stored,
        so each month plays emails, orders, returns, then tickets. Ignored emails fly past; quiet months get a whistle.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Scenery

const monthX = (i: number, months: number) => X0 + ((i + 0.5) * (X1 - X0)) / months;

function Track({ stops, sched, t }: { stops: Stop[]; sched: Schedule; t: number }) {
  const months = journeyMonths();
  // A trail marker appears once its act has finished playing.
  const finished = new Set(sched.segments.filter((x) => x.kind === 'act' && x.end <= t).map((x) => `${x.stop?.index}-${x.stop?.acts.indexOf(x.act!)}`));
  const done = (s: Stop, k: number) => finished.has(`${s.index}-${k}`);
  return (
    <g>
      <line x1={X0 - 20} x2={X1 + 20} y1={GROUND} y2={GROUND} stroke="var(--color-border)" strokeWidth={3} strokeLinecap="round" />
      {months.map((m, i) => {
        const x = monthX(i, months.length);
        const jan = m.getUTCMonth() === 0;
        const labelled = i === 0 || m.getUTCMonth() % 3 === 0;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={GROUND} y2={GROUND + (jan ? 14 : 7)} stroke="var(--color-border)" strokeWidth={jan ? 2 : 1} />
            {labelled && (
              <text x={x} y={GROUND + 30} textAnchor="middle" fontSize={12} fill="var(--color-muted-foreground)">
                {m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
              </text>
            )}
            {(jan || i === 0) && (
              <text x={x} y={GROUND + 48} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-muted-foreground)">
                {m.getUTCFullYear()}
              </text>
            )}
          </g>
        );
      })}
      {/* Trail: a marker per act already played */}
      {stops.map((s) => s.acts.map((a, k) => done(s, k) && (
        <text key={`${s.index}-${k}`} x={monthX(s.index, stops.length)} y={GROUND - 8 - k * 17} textAnchor="middle" fontSize={13} opacity={0.75}>
          {ICON[a.kind]}
        </text>
      )))}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// The walker

function Walker({ f, stops, business, finale }: { f: Frame; stops: Stop[]; business: boolean; finale: Finale }) {
  const x = X0 + ((f.pos + 0.5) * (X1 - X0)) / stops.length;
  const act = f.kind === 'act' ? f.segment.act : undefined;
  const p = f.p;
  const walking = f.kind === 'walk';
  const here = walking ? monthUnder(f, stops) : null;
  const local = f.pos - Math.round(f.pos) + 0.5; // 0..1 across the current month

  // Pose (radians from vertical; positive = forward / to the right)
  const phase = f.walked * Math.PI * 2 * 1.6;
  const legL = walking ? Math.sin(phase) * 0.45 : -0.12;
  let legR = walking ? -Math.sin(phase) * 0.45 : 0.12;
  let armL = walking ? -Math.sin(phase) * 0.35 : -0.15;
  let armR = walking ? Math.sin(phase) * 0.35 : 0.15;
  const bob = walking ? -Math.abs(Math.sin(phase)) * 3 : 0;
  let shake = 0;
  let liftR = 0;
  let sitting = false;
  const props: ReactNode[] = [];
  const float = (key: string, text: string, color: string, q: number, size = 18) => props.push(
    <text key={key} x={x} y={GROUND - 120 - q * 30} textAnchor="middle" fontSize={size} fontWeight={700} fill={color} opacity={Math.min(1, q * 4) * (1 - seg(q, 0.75, 1))}>{text}</text>,
  );
  const badge = (key: string, n: number, bx: number, by: number) => n > 1 && props.push(
    <text key={key} x={bx} y={by} fontSize={13} fontWeight={700} fill="var(--color-foreground)">×{count(n)}</text>,
  );

  if (act?.kind === 'buy') {
    const show = seg(p, 0, 0.12) * (1 - seg(p, 0.88, 1));
    props.push(<text key="shop" x={x + 70} y={GROUND - 4} fontSize={46} textAnchor="middle" opacity={show}>🏪</text>);
    const fly = ease(seg(p, 0.25, 0.6));
    const bx = x + 62 + (24 - 62) * fly;
    const by = GROUND - 52 + (-62 + 52) * fly - Math.sin(fly * Math.PI) * 25;
    props.push(<text key="box" x={bx} y={by} fontSize={24} textAnchor="middle" dominantBaseline="middle">📦</text>);
    badge('n', act.count, bx + 14, by - 14);
    armR = 1.4 * seg(p, 0.1, 0.3) - 0.5 * seg(p, 0.6, 0.75); // reach for the box, then hold it
    if (p > 0.5) float('amt', `+${money(act.amount)}`, 'var(--color-status-good)', seg(p, 0.5, 1));
  } else if (act?.kind === 'return') {
    props.push(<text key="bin" x={x + 72} y={GROUND - 2} fontSize={38} textAnchor="middle" opacity={seg(p, 0, 0.12)}
      transform={p > 0.62 && p < 0.75 ? `rotate(${Math.sin(p * 120) * 6} ${x + 72} ${GROUND})` : undefined}>🗑️</text>);
    const fly = ease(seg(p, 0.25, 0.62));
    const bx = x + 24 + (72 - 24) * fly;
    const by = GROUND - 62 + (-40 + 62) * fly - Math.sin(fly * Math.PI) * 70;
    if (p < 0.64) props.push(<text key="box" x={bx} y={by} fontSize={22} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${fly * 220} ${bx} ${by})`}>📦</text>);
    if (p < 0.25) badge('n', act.count, bx + 12, by - 14);
    armR = p < 0.2 ? 0.9 : p < 0.32 ? 0.9 + 1.9 * seg(p, 0.2, 0.32) : 2.8 - 1.5 * seg(p, 0.32, 0.6); // wind up, throw
    if (p > 0.5) float('amt', `-${money(act.amount)} refund`, 'var(--color-status-critical)', seg(p, 0.5, 1));
  } else if (act?.kind === 'stomp') {
    const sp = (p * 2) % 1;
    liftR = sp < 0.55 ? seg(sp, 0, 0.55) : 0;
    const slam = sp >= 0.55 && sp < 0.8;
    shake = slam ? Math.sin(sp * 140) * 3 : 0;
    legR = 0.15 + liftR * 0.5;
    armL = -0.6; armR = 0.6;
    props.push(
      <g key="mad" opacity={seg(p, 0, 0.08) * (1 - seg(p, 0.92, 1))}>
        <ellipse cx={x + 54} cy={GROUND - 128} rx={40} ry={18} fill="var(--color-card)" stroke="var(--color-foreground)" strokeWidth={1.5} />
        <text x={x + 54} y={GROUND - 128} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={800} fill="var(--color-status-critical)">#@!%</text>
        <text x={x - 22} y={GROUND - 112} fontSize={20}>💢</text>
      </g>,
    );
    if (slam) props.push(<text key="dust" x={x + 14} y={GROUND - 2} fontSize={18}>💨</text>, <text key="dust2" x={x - 30} y={GROUND - 2} fontSize={14}>💨</text>);
    badge('n', act.count, x + 98, GROUND - 124);
  } else if (act?.kind === 'email') {
    const drop = ease(seg(p, 0, 0.35));
    const ey = GROUND - 220 + (GROUND - 62 - (GROUND - 220)) * drop;
    const opened = p > 0.4;
    props.push(<text key="env" x={x + 22} y={ey} fontSize={26} textAnchor="middle" dominantBaseline="middle">{opened ? '📩' : '✉️'}</text>);
    if (opened) {
      const rise = ease(seg(p, 0.45, 0.85));
      props.push(<text key="letter" x={x + 22} y={GROUND - 70 - rise * 55} fontSize={22} textAnchor="middle" opacity={1 - seg(p, 0.8, 1)}>📄</text>);
      props.push(<text key="spark" x={x + 44} y={GROUND - 110 - rise * 20} fontSize={16} opacity={rise * (1 - seg(p, 0.85, 1))}>✨</text>);
    }
    badge('n', act.count, x + 40, ey - 12);
    armL = 1.0; armR = 1.15;
  } else if (walking && here) {
    if (here.ignored > 0) {
      for (let i = 0; i < Math.min(3, here.ignored); i++) {
        const ex = x + 180 - local * 360 - i * 40;
        props.push(<text key={`ig${i}`} x={ex} y={GROUND - 128 - (i % 2) * 16} fontSize={18} opacity={0.85}
          transform={`rotate(${-15 + i * 12} ${ex} ${GROUND - 128})`}>✉️</text>);
      }
      if (here.ignored > 3) props.push(<text key="ign" x={x + 30} y={GROUND - 150} fontSize={12} fill="var(--color-muted-foreground)">×{count(here.ignored)} ignored</text>);
    } else if (!here.acts.length) {
      props.push(<text key="note" x={x + 16 + local * 10} y={GROUND - 105 - local * 22} fontSize={16} opacity={Math.sin(local * Math.PI)} fill="var(--color-foreground)">♪</text>);
    }
  } else if (f.kind === 'finale') {
    if (finale === 'new') {
      armL = -2.6; armR = 2.6;
      props.push(<text key="party" x={x} y={GROUND - 130 - p * 10} textAnchor="middle" fontSize={30} opacity={seg(p, 0, 0.1)}>🎉</text>);
    } else if (finale === 'active') {
      armR = 2.5 + Math.sin(p * 30) * 0.35;
      props.push(<text key="hi" x={x + 40} y={GROUND - 124} fontSize={15} fontWeight={700} fill="var(--color-foreground)" opacity={seg(p, 0, 0.1)}>See you next month!</text>);
    } else if (finale === 'at-risk') {
      props.push(
        <g key="sign" opacity={seg(p, 0, 0.15)}>
          <line x1={x + 80} x2={x + 80} y1={GROUND} y2={GROUND - 70} stroke="var(--color-foreground)" strokeWidth={3} />
          <rect x={x + 80} y={GROUND - 92} width={108} height={26} rx={3} fill="var(--color-status-critical)" />
          <text x={x + 134} y={GROUND - 79} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={800} fill="#fff">COMPETITOR →</text>
        </g>,
        <text key="sweat" x={x + 12} y={GROUND - 96 + seg(p, 0.2, 1) * 10} fontSize={14} opacity={seg(p, 0.2, 0.3)}>💧</text>,
      );
      armR = 2.75; // scratching head
    } else {
      sitting = true;
      props.push(<text key="zz" x={x + 16} y={GROUND - 92 - p * 24} fontSize={18} opacity={seg(p, 0.15, 0.3)}>💤</text>);
    }
  }

  const hipY = sitting ? -22 : -40 + bob;
  const leg = (a: number, lift = 0): [number, number] => sitting ? [Math.sin(1.35) * 34, hipY + Math.cos(1.35) * 34 + 12] : [Math.sin(a) * 40, hipY + Math.cos(a) * 40 - lift * 22];
  const [lx, ly] = leg(legL);
  const [rx, ry] = leg(legR, liftR);
  const sh = { x: 0, y: hipY - 28 };
  const arm = (a: number): [number, number] => [sh.x + Math.sin(a) * 30, sh.y + Math.cos(a) * 30];
  const [alx, aly] = arm(armL);
  const [arx, ary] = arm(armR);
  const headY = sh.y - 17;
  const ink = 'var(--color-foreground)';

  return (
    <g>
      {props}
      <g transform={`translate(${x + shake} ${GROUND})`} stroke={ink} strokeWidth={4} strokeLinecap="round" fill="none">
        {sitting && <text x={-6} y={4} fontSize={34} textAnchor="middle" stroke="none">🪑</text>}
        {!business && <rect x={-15} y={sh.y + 2} width={11} height={20} rx={3} fill="var(--color-series-1)" stroke="none" />}
        <line x1={0} y1={hipY} x2={lx} y2={ly} />
        <line x1={0} y1={hipY} x2={rx} y2={ry} />
        <line x1={0} y1={hipY} x2={sh.x} y2={sh.y - 6} />
        <line x1={sh.x} y1={sh.y} x2={alx} y2={aly} />
        <line x1={sh.x} y1={sh.y} x2={arx} y2={ary} />
        <circle cx={0} cy={headY} r={11} fill="var(--color-card)" />
        {business && (
          <g stroke="none" fill="var(--color-primary)">
            <path d={`M -12 ${headY - 2} A 12 12 0 0 1 12 ${headY - 2} Z`} />
            <rect x={-16} y={headY - 3} width={32} height={4} rx={2} />
          </g>
        )}
        <circle cx={4} cy={headY - 1} r={1.4} fill={ink} stroke="none" />
        {act?.kind === 'stomp'
          ? <path d={`M -1 ${headY + 6} q 5 -4 10 0`} strokeWidth={2} />
          : <path d={`M -1 ${headY + 4} q 5 4 10 0`} strokeWidth={2} />}
      </g>
    </g>
  );
}
