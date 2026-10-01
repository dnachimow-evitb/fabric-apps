// Animated customer journey: a figure walks a 24-month timeline and acts out what the customer did each month
// (opens an email, buys, throws a return in the bin, stomps about a support ticket). Script and clock live in
// lib/journey.ts, artwork in journey-art.tsx; this file holds the clock and controls. It never autoplays.
import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import type { CustomerMonthRow } from '@/lib/c360';
import { count } from '@/lib/format';
import { buildJourney, finaleFor, frameAt, narrate, schedule } from '@/lib/journey';
import { cn } from '@/lib/utils';

import { JourneyLegend, Scene, VH, VW, Walker } from './journey-art';

const SPEEDS = [1, 2, 4] as const;

const BUTTON = 'inline-flex items-center gap-100 rounded-md border border-border px-300 py-100 text-300 font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

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
        <Scene stops={stops} sched={sched} t={t} />
        <Walker f={f} stops={stops} business={customerType === 'Wholesale'} finale={finale} />
      </svg>

      <JourneyLegend />

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
        so each month plays emails, orders, returns, then tickets. Each event leaves its icon on the timeline under its month.
      </p>
    </div>
  );
}
