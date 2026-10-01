// Customer journey animation: turns a customer's monthly facts (gold_customer_monthly) into a script of
// "stops" a walking figure acts out, and a clock that says where the walker is and what it's doing at time t.
// The table is monthly, so events inside a month play in a fixed order: emails, buying, returns, tickets.
import { FIRST_MONTH, LAST_MONTH, monthsBetween, type CustomerMonthRow } from './c360';
import { count, money } from './format';

export type ActKind = 'email' | 'buy' | 'return' | 'stomp';

export interface Act { kind: ActKind; count: number; amount?: number; label: string }

export interface Stop {
  /** 0-based month index on the timeline. */
  index: number;
  month: Date;
  acts: Act[];
  /** Campaign emails received but not opened or clicked: they fly past while walking into this month. */
  ignored: number;
}

export type Finale = 'new' | 'active' | 'at-risk' | 'lapsed';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const plural = (c: number, one: string, many = `${one}s`) => `${count(c)} ${c === 1 ? one : many}`;

export function journeyMonths(): Date[] {
  const [y, m] = FIRST_MONTH.split('-').map(Number);
  return Array.from({ length: monthsBetween(FIRST_MONTH, LAST_MONTH) }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)));
}

export function monthName(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** One entry per month, in timeline order. Rows for the same month (e.g. merged customers) are added up. */
export function buildJourney(rows: CustomerMonthRow[]): Stop[] {
  const months = journeyMonths();
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const byMonth = new Map<string, { sales: number; orders: number; rAmt: number; rCnt: number; touches: number; eng: number; tickets: number }>();
  for (const r of rows) {
    const k = key(r.month);
    const a = byMonth.get(k) ?? { sales: 0, orders: 0, rAmt: 0, rCnt: 0, touches: 0, eng: 0, tickets: 0 };
    a.sales += n(r.netSales); a.orders += n(r.orders); a.rAmt += n(r.returnsAmount); a.rCnt += n(r.returnsCount);
    a.touches += n(r.marketingTouches); a.eng += n(r.marketingEngagements); a.tickets += n(r.tickets);
    byMonth.set(k, a);
  }
  return months.map((month, index) => {
    const a = byMonth.get(key(month));
    const acts: Act[] = [];
    if (a?.eng) acts.push({ kind: 'email', count: a.eng, label: `opened ${plural(a.eng, 'email')}` });
    if (a?.orders) acts.push({ kind: 'buy', count: a.orders, amount: a.sales, label: `placed ${plural(a.orders, 'order')} (${money(a.sales)})` });
    if (a?.rCnt || a?.rAmt) {
      const c = Math.max(1, a.rCnt);
      acts.push({ kind: 'return', count: c, amount: a.rAmt, label: `returned ${plural(c, 'item')} (${money(a.rAmt)} refunded)` });
    }
    if (a?.tickets) acts.push({ kind: 'stomp', count: a.tickets, label: `opened ${plural(a.tickets, 'support ticket')}` });
    return { index, month, acts, ignored: Math.max(0, (a?.touches ?? 0) - (a?.eng ?? 0)) };
  });
}

export function finaleFor(lifecycle: string | null | undefined, riskBand: string | null | undefined): Finale {
  if (lifecycle === 'Lapsed') return 'lapsed';
  if (lifecycle === 'At Risk' || riskBand === 'High') return 'at-risk';
  if (lifecycle === 'New') return 'new';
  return 'active';
}

export const FINALE_LABEL: Record<Finale, string> = {
  new: 'New customer: welcome to the party!',
  active: 'Active customer: still walking with us.',
  'at-risk': 'At risk: eyeing the competition.',
  lapsed: 'Lapsed: has stopped buying and sat down for a rest.',
};

// ---------------------------------------------------------------------------------------------
// Clock

/** Seconds at 1× speed. Act lengths shrink for very busy customers so a run stays watchable. */
const WALK_PER_MONTH = 0.45;
const ACT_SECONDS: Record<ActKind, number> = { email: 1.1, buy: 1.3, return: 1.3, stomp: 1.2 };
const FINALE_SECONDS = 2.6;
const TARGET_SECONDS = 70;
const MIN_SCALE = 0.45;

export interface Segment {
  kind: 'walk' | 'act' | 'finale';
  start: number;
  end: number;
  /** Month index the walker walks from / stands at. */
  from: number;
  to: number;
  stop?: Stop;
  act?: Act;
}

export interface Schedule { segments: Segment[]; total: number; months: number }

export function schedule(stops: Stop[]): Schedule {
  const months = stops.length;
  const rawActs = stops.reduce((s, st) => s + st.acts.reduce((a, x) => a + ACT_SECONDS[x.kind], 0), 0);
  const walkTotal = WALK_PER_MONTH * months;
  const scale = Math.max(MIN_SCALE, Math.min(1, (TARGET_SECONDS - walkTotal - FINALE_SECONDS) / Math.max(rawActs, 1)));
  const segments: Segment[] = [];
  let t = 0;
  let at = -0.5; // start half a month before the first month
  const walk = (to: number, stop?: Stop) => {
    if (to <= at) return;
    const d = (to - at) * WALK_PER_MONTH;
    segments.push({ kind: 'walk', start: t, end: t + d, from: at, to, stop });
    t += d; at = to;
  };
  for (const st of stops) {
    if (!st.acts.length) continue;
    walk(st.index, st);
    for (const act of st.acts) {
      const d = ACT_SECONDS[act.kind] * scale;
      segments.push({ kind: 'act', start: t, end: t + d, from: st.index, to: st.index, stop: st, act });
      t += d;
    }
  }
  walk(months - 0.5);
  segments.push({ kind: 'finale', start: t, end: t + FINALE_SECONDS, from: at, to: at });
  t += FINALE_SECONDS;
  return { segments, total: t, months };
}

export interface Frame {
  /** Position in months along the timeline (fractional while walking). */
  pos: number;
  kind: Segment['kind'];
  /** 0..1 progress through the current segment. */
  p: number;
  segment: Segment;
  /** Distance walked so far, in months: drives the leg swing. */
  walked: number;
}

export function frameAt(s: Schedule, time: number): Frame {
  const t = Math.min(Math.max(time, 0), s.total);
  const seg = s.segments.find((x) => t < x.end) ?? s.segments[s.segments.length - 1];
  const p = seg.end > seg.start ? Math.min(1, (t - seg.start) / (seg.end - seg.start)) : 1;
  const pos = seg.kind === 'walk' ? seg.from + (seg.to - seg.from) * p : seg.to;
  return { pos, kind: seg.kind, p, segment: seg, walked: pos + 0.5 };
}

/** Plain-language narration of a frame, for the caption and screen readers. */
export function narrate(f: Frame, finale: Finale, stops: Stop[]): string {
  const seg = f.segment;
  if (seg.kind === 'finale') return FINALE_LABEL[finale];
  if (seg.kind === 'act' && seg.stop && seg.act) return `${monthName(seg.stop.month)}: ${seg.act.label}.`;
  const here = monthUnder(f, stops);
  if (!here) return 'Setting off…';
  const quiet = here.acts.length ? '' : ' A quiet month.';
  const ignored = here.ignored > 0 ? ` Ignoring ${plural(here.ignored, 'marketing email')}.` : '';
  return `${monthName(here.month)}…${quiet}${ignored}`;
}

/** The month the walker is in while walking (null before the first month). */
export function monthUnder(f: Frame, stops: Stop[]): Stop | null {
  const i = Math.round(f.pos);
  return i >= 0 && i < stops.length ? stops[i] : null;
}
