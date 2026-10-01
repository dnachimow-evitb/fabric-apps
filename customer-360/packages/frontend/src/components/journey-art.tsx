// Artwork for the customer journey: a flat-illustrated character, props and scenery, all plain SVG.
// Everything near the walker is drawn in local coordinates around the feet (y up is negative) and the
// group is scaled up as one, so props stay attached to hands and ground.
import type { ReactNode } from 'react';

import { count, money } from '@/lib/format';
import { journeyMonths, monthUnder, type Finale, type Frame, type Schedule, type Stop } from '@/lib/journey';

export const VW = 1000;
export const VH = 290;
const X0 = 40;
const X1 = 960;
const GROUND = 222;
/** The character and props are drawn at a compact size and scaled up around the feet. */
const SCALE = 1.4;

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const monthX = (i: number, months: number) => X0 + ((i + 0.5) * (X1 - X0)) / months;

// Palette for the illustration (fixed: the character reads the same in light and dark mode).
const P = {
  skin: '#f0c49b', skinShade: '#d9a77c', hair: '#3b2a20', pants: '#2f3b52', pantsShade: '#25304a', shoe: '#1f2328',
  workShirt: '#5b6b7f', workShirtShade: '#4a586b', vest: '#f26b1d', vestShade: '#d85a12', reflect: '#e9eef3', hat: '#f5b301', hatShade: '#d99b00',
  hoodie: '#2f7fd1', hoodieShade: '#2468b0', pack: '#36435a',
  kraft: '#c99459', kraftDark: '#b07c44', tape: '#ead2a2', metal: '#9aa4af', metalDark: '#7d8792',
  paper: '#ffffff', paperLine: '#cbd5e1', good: '#2b8a3e', bad: '#c92a2a', wood: '#a0714f', woodDark: '#7d553a',
  awningA: '#c2410c', awningB: '#fff7ed', counter: '#e7dccf',
};

// ---------------------------------------------------------------------------------------------
// Scenery

export function Scene({ stops, sched, t }: { stops: Stop[]; sched: Schedule; t: number }) {
  const months = journeyMonths();
  const finished = new Set(sched.segments.filter((x) => x.kind === 'act' && x.end <= t).map((x) => `${x.stop?.index}-${x.stop?.acts.indexOf(x.act!)}`));
  return (
    <g>
      <Skyline />
      <rect x={0} y={GROUND} width={VW} height={VH - GROUND} fill="var(--color-border)" opacity={0.35} />
      <line x1={0} x2={VW} y1={GROUND} y2={GROUND} stroke="var(--color-border)" strokeWidth={2} />
      {months.map((m, i) => {
        const x = monthX(i, months.length);
        const jan = m.getUTCMonth() === 0;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={GROUND} y2={GROUND + (jan ? 12 : 6)} stroke="var(--color-muted-foreground)" strokeWidth={jan ? 1.5 : 1} opacity={0.6} />
            {(i === 0 || m.getUTCMonth() % 3 === 0) && (
              <text x={x} y={GROUND + 28} textAnchor="middle" fontSize={12} fill="var(--color-muted-foreground)">
                {m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
              </text>
            )}
            {(jan || i === 0) && (
              <text x={x} y={GROUND + 46} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-muted-foreground)">{m.getUTCFullYear()}</text>
            )}
          </g>
        );
      })}
      {/* Trail: a small icon for each act already played */}
      {stops.map((s) => s.acts.map((a, k) => finished.has(`${s.index}-${k}`) && (
        <g key={`${s.index}-${k}`} transform={`translate(${monthX(s.index, stops.length)} ${GROUND - 9 - k * 15}) scale(0.5)`} opacity={0.85}>
          {a.kind === 'buy' ? <Box /> : a.kind === 'return' ? <Bin small /> : a.kind === 'email' ? <Envelope /> : <TicketBadge />}
        </g>
      )))}
    </g>
  );
}

/** A faint, deterministic city skyline behind the path. */
function Skyline() {
  const blocks: ReactNode[] = [];
  let x = -10;
  let i = 0;
  while (x < VW) {
    const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const w = 26 + Math.abs(r) * 26;
    const h = 28 + Math.abs((Math.sin(i * 78.233) * 12345.678) % 1) * 70;
    blocks.push(<rect key={i} x={x} y={GROUND - h} width={w} height={h} rx={2} fill="var(--color-border)" opacity={0.28} />);
    x += w + 6;
    i++;
  }
  return <g aria-hidden>{blocks}</g>;
}

// ---------------------------------------------------------------------------------------------
// Props (local coordinates, centred on the origin unless noted)

function Box() {
  return (
    <g>
      <rect x={-10} y={-8} width={20} height={16} rx={1.5} fill={P.kraft} />
      <rect x={-10} y={-8} width={20} height={4.5} rx={1.5} fill={P.kraftDark} />
      <rect x={-2} y={-8} width={4} height={16} fill={P.tape} opacity={0.9} />
    </g>
  );
}

/** Bin standing on the ground at the origin; `lid` tilts the lid open (radians). */
function Bin({ lid = 0, small = false }: { lid?: number; small?: boolean }) {
  const y = small ? 8 : 0; // the trail version is centred like the other icons
  return (
    <g transform={`translate(0 ${y})`}>
      <path d="M -12 -30 L 12 -30 L 9.5 0 L -9.5 0 Z" fill={P.metal} />
      {[-5, 0, 5].map((rx) => <line key={rx} x1={rx} x2={rx * 0.85} y1={-26} y2={-4} stroke={P.metalDark} strokeWidth={1.6} strokeLinecap="round" />)}
      <g transform={`rotate(${(-lid * 180) / Math.PI} -14 -32)`}>
        <rect x={-14} y={-35} width={28} height={5} rx={2} fill={P.metalDark} />
        <rect x={-4} y={-38} width={8} height={3} rx={1.5} fill={P.metalDark} />
      </g>
    </g>
  );
}

function Envelope({ open = 0 }: { open?: number }) {
  return (
    <g>
      {open > 0 && <path d={`M -11 -7.5 L 0 ${-7.5 - 9 * open} L 11 -7.5 Z`} fill="#eef2f7" stroke={P.paperLine} strokeWidth={1} strokeLinejoin="round" />}
      <rect x={-11} y={-7.5} width={22} height={15} rx={1.5} fill={P.paper} stroke={P.paperLine} strokeWidth={1} />
      {open === 0 && <path d="M -11 -7.5 L 0 1 L 11 -7.5" fill="none" stroke={P.paperLine} strokeWidth={1.2} strokeLinejoin="round" />}
      <path d="M -11 7.5 L -2 0 M 11 7.5 L 2 0" stroke={P.paperLine} strokeWidth={0.8} />
    </g>
  );
}

function Letter() {
  return (
    <g>
      <rect x={-8} y={-10} width={16} height={20} rx={1.5} fill={P.paper} stroke={P.paperLine} />
      {[-5, -1, 3].map((y) => <line key={y} x1={-5} x2={y === 3 ? 1 : 5} y1={y} y2={y} stroke="#94a3b8" strokeWidth={1.4} strokeLinecap="round" />)}
    </g>
  );
}

function TicketBadge() {
  return (
    <g>
      <circle r={9} fill={P.bad} />
      <path d="M 1.5 -6 L -3 1 L 0.5 1 L -1.5 6 L 3.5 -1 L 0 -1 Z" fill="#fff" />
    </g>
  );
}

/** Market stall standing on the ground at the origin. */
function Stall() {
  const stripes = 6;
  const w = 64;
  return (
    <g>
      <rect x={-w / 2 + 3} y={-62} width={4} height={62} fill={P.woodDark} />
      <rect x={w / 2 - 7} y={-62} width={4} height={62} fill={P.woodDark} />
      <rect x={-w / 2} y={-26} width={w} height={26} rx={2} fill={P.counter} stroke={P.woodDark} strokeWidth={1.5} />
      <rect x={-w / 2} y={-28} width={w} height={4} rx={1} fill={P.wood} />
      {Array.from({ length: stripes }, (_, i) => (
        <path key={i} fill={i % 2 ? P.awningB : P.awningA}
          d={`M ${-w / 2 + (i * w) / stripes} -72 h ${w / stripes} v 12 a ${w / stripes / 2} ${w / stripes / 2.4} 0 0 1 ${-w / stripes} 0 Z`} />
      ))}
      <rect x={-w / 2} y={-76} width={w} height={5} rx={2} fill={P.awningA} />
      <rect x={-16} y={-96} width={32} height={14} rx={3} fill="var(--color-card)" stroke={P.awningA} strokeWidth={1.5} />
      <text x={0} y={-89} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={800} fill={P.awningA} letterSpacing={1}>SHOP</text>
    </g>
  );
}

function Bench() {
  return (
    <g>
      <rect x={-26} y={-28} width={52} height={5} rx={2} fill={P.wood} />
      <rect x={-26} y={-50} width={52} height={5} rx={2} fill={P.wood} />
      <rect x={-26} y={-41} width={52} height={5} rx={2} fill={P.wood} />
      <rect x={-23} y={-50} width={3} height={50} fill={P.woodDark} />
      <rect x={20} y={-23} width={3} height={23} fill={P.woodDark} />
    </g>
  );
}

/** A rounded label with a coloured background. */
function Pill({ x, y, text, color, opacity = 1 }: { x: number; y: number; text: string; color: string; opacity?: number }) {
  const w = text.length * 6.6 + 16;
  return (
    <g opacity={opacity}>
      <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={11} fill={color} />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill="#fff">{text}</text>
    </g>
  );
}

function Count({ x, y, n }: { x: number; y: number; n: number }) {
  if (n <= 1) return null;
  const text = `×${count(n)}`;
  const w = text.length * 6 + 10;
  return (
    <g>
      <rect x={x - w / 2} y={y - 8} width={w} height={16} rx={8} fill="var(--color-foreground)" />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="var(--color-background)">{text}</text>
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// The character

interface Limb { a: number; k: number }
interface Pose {
  legF: Limb; legB: Limb; armF: Limb; armB: Limb;
  lean: number; mood: 'happy' | 'angry' | 'worried' | 'sleepy'; look: 1 | -1; sitting: boolean;
}

const THIGH = 22;
const SHIN = 22;
const UPPER = 15;
const FORE = 14;

const legEnd = (hipY: number, l: Limb) => {
  const kx = Math.sin(l.a) * THIGH;
  const ky = hipY + Math.cos(l.a) * THIGH;
  return { kx, ky, fx: kx + Math.sin(l.a - l.k) * SHIN, fy: ky + Math.cos(l.a - l.k) * SHIN };
};
const armEnd = (sx: number, sy: number, l: Limb) => {
  const ex = sx + Math.sin(l.a) * UPPER;
  const ey = sy + Math.cos(l.a) * UPPER;
  return { ex, ey, hx: ex + Math.sin(l.a + l.k) * FORE, hy: ey + Math.cos(l.a + l.k) * FORE };
};

function Character({ pose, business }: { pose: Pose; business: boolean }) {
  // Hip height keeps the lower foot on the ground (or on the bench when sitting).
  const reach = (l: Limb) => Math.cos(l.a) * THIGH + Math.cos(l.a - l.k) * SHIN;
  const hipY = pose.sitting ? -27 : -Math.max(reach(pose.legF), reach(pose.legB));
  const lf = legEnd(hipY, pose.legF);
  const lb = legEnd(hipY, pose.legB);
  const sx = pose.lean * 6;
  const sy = hipY - 26;
  const af = armEnd(sx + 1, sy + 3, pose.armF);
  const ab = armEnd(sx - 1, sy + 3, pose.armB);
  const headX = sx + 1 + pose.lean * 3;
  const headY = sy - 15;
  const shirt = business ? P.workShirt : P.hoodie;
  const shirtShade = business ? P.workShirtShade : P.hoodieShade;

  const leg = (l: ReturnType<typeof legEnd>, color: string) => (
    <g>
      <path d={`M 0 ${hipY} L ${l.kx} ${l.ky} L ${l.fx} ${l.fy}`} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={l.fx - 4.5} y={l.fy - 1} width={14} height={6} rx={3} fill={P.shoe} />
    </g>
  );
  const arm = (a: ReturnType<typeof armEnd>, x0: number, color: string) => (
    <g>
      <path d={`M ${x0} ${sy + 3} L ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={a.hx} cy={a.hy} r={3.8} fill={P.skin} />
    </g>
  );

  const eye = { x: headX + 5 * pose.look, y: headY - 1 };
  const mouthX = headX + 6 * pose.look;
  return (
    <g>
      <ellipse cx={0} cy={1} rx={pose.sitting ? 26 : 18} ry={3.5} fill="#000" opacity={0.12} />
      {!business && <rect x={sx - 19} y={sy - 1} width={11} height={22} rx={4} fill={P.pack} />}
      {arm(ab, sx - 1, shirtShade)}
      {leg(lb, P.pantsShade)}
      {leg(lf, P.pants)}
      {/* torso */}
      <path d={`M ${sx - 10} ${sy + 4} Q ${sx - 10} ${sy - 3} ${sx - 3} ${sy - 3} L ${sx + 3} ${sy - 3} Q ${sx + 10} ${sy - 3} ${sx + 10} ${sy + 4} L 9 ${hipY + 2} Q 9 ${hipY + 5} 6 ${hipY + 5} L -6 ${hipY + 5} Q -9 ${hipY + 5} -9 ${hipY + 2} Z`} fill={shirt} />
      {business ? (
        <g>
          <path d={`M ${sx - 9.5} ${sy + 3} L ${sx - 2} ${sy - 2} L -2 ${hipY + 4} L -8.5 ${hipY + 4} Z M ${sx + 9.5} ${sy + 3} L ${sx + 2} ${sy - 2} L 2 ${hipY + 4} L 8.5 ${hipY + 4} Z`} fill={P.vest} />
          <rect x={-9} y={hipY - 12} width={18} height={2.6} fill={P.reflect} opacity={0.95} />
          <rect x={-9} y={hipY - 6} width={18} height={2.6} fill={P.reflect} opacity={0.95} />
        </g>
      ) : (
        <g>
          <path d={`M ${sx - 7} ${sy - 1} Q ${sx - 12} ${sy - 9} ${sx - 4} ${sy - 8}`} fill="none" stroke={shirtShade} strokeWidth={4} strokeLinecap="round" />
          <path d={`M -6 ${hipY - 4} Q 0 ${hipY - 8} 6 ${hipY - 4}`} fill="none" stroke={shirtShade} strokeWidth={1.5} />
          <line x1={sx - 6} y1={sy} x2={-4} y2={hipY - 6} stroke={P.pack} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}
      {/* neck and head */}
      <rect x={headX - 3} y={sy - 6} width={6} height={6} rx={2} fill={P.skinShade} />
      <circle cx={headX} cy={headY} r={10.5} fill={P.skin} />
      <circle cx={headX - 4 * pose.look} cy={headY + 1} r={2.4} fill={P.skinShade} />
      {business ? (
        <g>
          <path d={`M ${headX - 11.5} ${headY - 3} A 12 11.5 0 0 1 ${headX + 11.5} ${headY - 3} Z`} fill={P.hat} />
          <rect x={headX - (pose.look > 0 ? 12 : 16)} y={headY - 4.5} width={28} height={3.5} rx={1.75} fill={P.hatShade} />
          <rect x={headX - 1.5} y={headY - 14} width={3} height={10} rx={1.5} fill={P.hatShade} />
        </g>
      ) : (
        <path d={`M ${headX - 10.5} ${headY - 1} A 10.5 10.5 0 0 1 ${headX + 10} ${headY - 4} Q ${headX + 2} ${headY - 7} ${headX - 3 * pose.look} ${headY - 3} Q ${headX - 8} ${headY - 1} ${headX - 10.5} ${headY + 3} Z`} fill={P.hair} />
      )}
      {/* face */}
      {pose.mood === 'sleepy'
        ? <path d={`M ${eye.x - 2} ${eye.y} q 2 1.6 4 0`} stroke={P.hair} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        : <ellipse cx={eye.x} cy={eye.y} rx={1.4} ry={1.7} fill={P.hair} />}
      {pose.mood === 'angry' && <line x1={eye.x - 3 * pose.look} y1={eye.y - 5} x2={eye.x + 2 * pose.look} y2={eye.y - 3} stroke={P.hair} strokeWidth={1.6} strokeLinecap="round" />}
      {pose.mood === 'worried' && <line x1={eye.x - 3 * pose.look} y1={eye.y - 3} x2={eye.x + 2 * pose.look} y2={eye.y - 5} stroke={P.hair} strokeWidth={1.3} strokeLinecap="round" />}
      <circle cx={headX + 6.5 * pose.look} cy={headY + 3} r={2} fill="#e88a7d" opacity={0.35} />
      <path d={pose.mood === 'angry' || pose.mood === 'worried'
        ? `M ${mouthX - 2.5} ${headY + 6} q 2.5 -2 5 0`
        : `M ${mouthX - 2.5} ${headY + 4.5} q 2.5 2.4 5 0`} stroke="#8a4b3c" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {arm(af, sx + 1, shirt)}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Walker: picks the pose and props for the current frame

export function Walker({ f, stops, business, finale }: { f: Frame; stops: Stop[]; business: boolean; finale: Finale }) {
  const x = X0 + ((f.pos + 0.5) * (X1 - X0)) / stops.length;
  const act = f.kind === 'act' ? f.segment.act : undefined;
  const p = f.p;
  const walking = f.kind === 'walk';
  const here = walking ? monthUnder(f, stops) : null;
  const local = f.pos - Math.round(f.pos) + 0.5;

  const ph = f.walked * Math.PI * 2 * 1.5 + Math.PI / 2;
  const stride = (o: number): Limb => ({ a: Math.sin(ph + o) * 0.5, k: 0.12 + 0.6 * Math.max(0, Math.sin(ph + o - 1.2)) });
  const stand: Pose = {
    legF: { a: 0.08, k: 0.04 }, legB: { a: -0.06, k: 0.04 }, armF: { a: 0.12, k: 0.25 }, armB: { a: -0.1, k: 0.25 },
    lean: 0, mood: 'happy', look: 1, sitting: false,
  };
  const pose: Pose = walking
    ? { ...stand, legF: stride(0), legB: stride(Math.PI), armF: { a: -Math.sin(ph) * 0.45, k: 0.35 }, armB: { a: Math.sin(ph) * 0.45, k: 0.35 }, lean: 0.15 }
    : { ...stand };
  let shake = 0;
  const back: ReactNode[] = []; // drawn behind the character
  const front: ReactNode[] = []; // drawn in front of it
  const hand = () => {
    // where the front hand is, for props held in it
    const hipY = -Math.max(Math.cos(pose.legF.a) * THIGH + Math.cos(pose.legF.a - pose.legF.k) * SHIN, Math.cos(pose.legB.a) * THIGH + Math.cos(pose.legB.a - pose.legB.k) * SHIN);
    const e = armEnd(pose.lean * 6 + 1, hipY - 23, pose.armF);
    return { x: e.hx, y: e.hy };
  };

  if (act?.kind === 'buy') {
    back.push(<g key="stall" transform="translate(62 0)" opacity={seg(p, 0, 0.12) * (1 - seg(p, 0.88, 1))}><Stall /></g>);
    pose.armF = { a: 1.45 * seg(p, 0.08, 0.28) - 0.75 * seg(p, 0.6, 0.75), k: 0.15 + 0.9 * seg(p, 0.6, 0.75) };
    pose.armB = { a: 0.5 * seg(p, 0.6, 0.75), k: 0.25 + 0.9 * seg(p, 0.6, 0.75) };
    const h = hand();
    const fly = ease(seg(p, 0.25, 0.6));
    const bx = 62 + (h.x - 62) * fly;
    const by = -34 + (h.y - 2 + 34) * fly - Math.sin(fly * Math.PI) * 22;
    front.push(<g key="box" transform={`translate(${bx} ${by})`}><Box /></g>, <Count key="n" x={bx + 16} y={by - 14} n={act.count} />);
    if (p > 0.5) front.push(<Pill key="amt" x={0} y={-118 - seg(p, 0.5, 1) * 18} text={`+${money(act.amount)}`} color={P.good} opacity={seg(p, 0.5, 0.6) * (1 - seg(p, 0.85, 1))} />);
  } else if (act?.kind === 'return') {
    const lid = p > 0.4 && p < 0.8 ? 0.6 * seg(p, 0.4, 0.5) * (1 - seg(p, 0.7, 0.8)) : 0;
    back.push(<g key="bin" transform="translate(66 0)" opacity={seg(p, 0, 0.12) * (1 - seg(p, 0.9, 1))}><Bin lid={lid} /></g>);
    pose.armF = p < 0.2 ? { a: 0.55, k: 1.0 } : p < 0.34 ? { a: 0.55 + 2.2 * seg(p, 0.2, 0.34), k: 1.0 - 0.6 * seg(p, 0.2, 0.34) } : { a: 2.75 - 1.4 * seg(p, 0.34, 0.5), k: 0.4 - 0.3 * seg(p, 0.34, 0.5) };
    pose.lean = p < 0.34 ? -0.2 * seg(p, 0.2, 0.34) : 0.3 * seg(p, 0.34, 0.5);
    const h = hand();
    const fly = ease(seg(p, 0.42, 0.7));
    const bx = h.x + (66 - h.x) * fly;
    const by = (p < 0.42 ? h.y - 2 : (h.y - 2) + (-28 - (h.y - 2)) * fly) - Math.sin(fly * Math.PI) * 60;
    if (p < 0.72) front.push(<g key="box" transform={`translate(${bx} ${by}) rotate(${fly * 260})`}><Box /></g>);
    if (p < 0.42) front.push(<Count key="n" x={bx + 16} y={by - 14} n={act.count} />);
    if (p > 0.55) front.push(<Pill key="amt" x={0} y={-118 - seg(p, 0.55, 1) * 18} text={`-${money(act.amount)} refund`} color={P.bad} opacity={seg(p, 0.55, 0.65) * (1 - seg(p, 0.88, 1))} />);
  } else if (act?.kind === 'stomp') {
    const sp = (p * 2) % 1;
    const lift = sp < 0.5 ? ease(seg(sp, 0, 0.5)) : 0;
    const slam = sp >= 0.5 && sp < 0.72;
    shake = slam ? Math.sin(sp * 150) * 2.2 : 0;
    pose.legF = { a: 0.9 * lift, k: 1.5 * lift };
    pose.armF = { a: -0.35, k: 0.25 };
    pose.armB = { a: 0.35, k: 0.25 };
    pose.mood = 'angry';
    const vis = seg(p, 0, 0.08) * (1 - seg(p, 0.92, 1));
    front.push(
      <g key="bubble" opacity={vis} transform={`translate(38 -116) scale(${1 + (slam ? 0.06 : 0)})`}>
        <path d="M -30 -14 h 60 a 10 10 0 0 1 10 10 v 8 a 10 10 0 0 1 -10 10 h -44 l -10 9 l 2 -9 h -8 a 10 10 0 0 1 -10 -10 v -8 a 10 10 0 0 1 10 -10 Z" fill="var(--color-card)" stroke={P.bad} strokeWidth={2} />
        <text x={0} y={0.5} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={800} fill={P.bad}>#@!%</text>
      </g>,
      <Count key="n" x={92} y={-130} n={act.count} />,
    );
    if (slam) {
      front.push(
        <g key="impact" stroke="var(--color-muted-foreground)" strokeWidth={2} strokeLinecap="round">
          <line x1={-4} y1={-4} x2={-14} y2={-10} /><line x1={-6} y1={2} x2={-18} y2={1} />
          <line x1={18} y1={-4} x2={28} y2={-10} /><line x1={20} y1={2} x2={32} y2={1} />
        </g>,
      );
    }
  } else if (act?.kind === 'email') {
    pose.armF = { a: 0.75 * seg(p, 0.25, 0.4), k: 0.25 + 0.95 * seg(p, 0.25, 0.4) };
    pose.armB = { a: 0.6 * seg(p, 0.25, 0.4), k: 0.25 + 0.9 * seg(p, 0.25, 0.4) };
    const h = hand();
    const drop = ease(seg(p, 0, 0.38));
    const ex = h.x + 2;
    const ey = -190 + (h.y - 4 + 190) * drop;
    const open = seg(p, 0.42, 0.55);
    front.push(<g key="env" transform={`translate(${ex} ${ey}) rotate(${(1 - drop) * -25})`}><Envelope open={open} /></g>);
    if (p > 0.5) {
      const rise = ease(seg(p, 0.5, 0.85));
      front.push(<g key="letter" transform={`translate(${ex} ${ey - 6 - rise * 42})`} opacity={1 - seg(p, 0.82, 1)}><Letter /></g>);
    }
    front.push(<Count key="n" x={ex + 18} y={ey - 14} n={act.count} />);
  } else if (walking && here) {
    if (here.ignored > 0) {
      for (let i = 0; i < Math.min(3, here.ignored); i++) {
        const ex = 150 - local * 300 - i * 34;
        const ey = -112 - (i % 2) * 12 + Math.sin(local * 9 + i) * 4;
        front.push(
          <g key={`ig${i}`} transform={`translate(${ex} ${ey}) rotate(${-14 + i * 10}) scale(0.8)`} opacity={0.9}>
            <line x1={14} y1={-3} x2={26} y2={-3} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
            <line x1={14} y1={3} x2={22} y2={3} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
            <Envelope />
          </g>,
        );
      }
      if (here.ignored > 3) front.push(<text key="ign" x={24} y={-138} fontSize={11} fontWeight={600} fill="var(--color-muted-foreground)">{count(here.ignored)} ignored</text>);
    } else if (!here.acts.length) {
      front.push(<text key="note" x={14 + local * 8} y={-96 - local * 20} fontSize={15} fontWeight={700} opacity={Math.sin(local * Math.PI)} fill="var(--color-muted-foreground)">♪</text>);
    }
  } else if (f.kind === 'finale') {
    if (finale === 'new') {
      pose.armF = { a: 2.7, k: 0.2 };
      pose.armB = { a: -2.7, k: -0.2 };
      const colors = [P.awningA, P.hat, P.hoodie, P.good, '#a855f7'];
      for (let i = 0; i < 16; i++) {
        const cx = Math.sin(i * 7.3) * 60;
        const cy = -150 + ((p * 120 + i * 23) % 130);
        front.push(<rect key={`c${i}`} x={cx} y={cy} width={4} height={7} rx={1} fill={colors[i % colors.length]}
          transform={`rotate(${(p * 400 + i * 40) % 360} ${cx + 2} ${cy + 3})`} opacity={seg(p, 0, 0.1)} />);
      }
      front.push(<Pill key="w" x={-70} y={-120} text="Welcome aboard!" color={P.awningA} opacity={seg(p, 0.05, 0.15)} />);
    } else if (finale === 'active') {
      pose.armF = { a: 2.6 + Math.sin(p * 28) * 0.3, k: 0.5 };
      front.push(<Pill key="hi" x={-80} y={-112} text="See you next month!" color={P.good} opacity={seg(p, 0.05, 0.15)} />);
    } else if (finale === 'at-risk') {
      pose.look = -1;
      pose.mood = 'worried';
      pose.armF = { a: 2.9, k: 0.9 }; // scratching head
      back.push(
        <g key="sign" opacity={seg(p, 0, 0.15)} transform="translate(-70 0)">
          <rect x={-2} y={-74} width={4} height={74} fill={P.woodDark} />
          <path d="M -48 -96 h 74 v 22 h -74 l -10 -11 Z" fill={P.bad} />
          <text x={-9} y={-84.5} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={800} fill="#fff" letterSpacing={0.5}>COMPETITOR</text>
        </g>,
      );
      front.push(<path key="sweat" d="M 14 -96 q 3 5 0 7 q -3 -2 0 -7 Z" fill="#60a5fa" opacity={seg(p, 0.2, 0.3)} transform={`translate(0 ${seg(p, 0.3, 1) * 8})`} />);
    } else {
      pose.sitting = true;
      pose.mood = 'sleepy';
      pose.legF = { a: Math.PI / 2, k: Math.PI / 2 };
      pose.legB = { a: Math.PI / 2 - 0.1, k: Math.PI / 2 - 0.1 };
      pose.armF = { a: 0.6, k: 0.6 };
      back.push(<g key="bench" transform="translate(-4 0)"><Bench /></g>);
      front.push(<text key="zz" x={-34} y={-86 - p * 22} fontSize={16} fontWeight={800} fill="var(--color-muted-foreground)" opacity={seg(p, 0.15, 0.3)}>z Z</text>);
    }
  }

  return (
    <g transform={`translate(${x} ${GROUND}) scale(${SCALE})`}>
      {back}
      <g transform={`translate(${shake} 0)`}><Character pose={pose} business={business} /></g>
      {front}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Legend: the same drawn icons the trail uses, with what they mean

const LEGEND: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'email', label: 'Email opened or clicked', icon: <Envelope open={1} /> },
  { key: 'buy', label: 'Order placed', icon: <Box /> },
  { key: 'return', label: 'Item returned', icon: <Bin small /> },
  { key: 'stomp', label: 'Support ticket', icon: <TicketBadge /> },
  {
    key: 'ignored', label: 'Email ignored (flies past)', icon: (
      <g opacity={0.9}>
        <line x1={13} y1={-3} x2={22} y2={-3} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={13} y1={3} x2={19} y2={3} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
        <g transform="translate(-3 0) scale(0.85)"><Envelope /></g>
      </g>
    ),
  },
  { key: 'quiet', label: 'Quiet month', icon: <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={18} fontWeight={700} fill="var(--color-muted-foreground)">♪</text> },
  {
    key: 'wholesale', label: 'Hard hat: Wholesale customer', icon: (
      <g transform="translate(0 4)">
        <path d="M -11.5 -3 A 12 11.5 0 0 1 11.5 -3 Z" fill={P.hat} />
        <rect x={-14} y={-4.5} width={28} height={3.5} rx={1.75} fill={P.hatShade} />
      </g>
    ),
  },
  {
    key: 'direct', label: 'Hoodie and backpack: Direct customer', icon: (
      <g>
        <rect x={-12} y={-10} width={9} height={18} rx={3.5} fill={P.pack} />
        <rect x={-5} y={-11} width={16} height={22} rx={6} fill={P.hoodie} />
      </g>
    ),
  },
];

export function JourneyLegend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-500 gap-y-200 text-200 text-muted-foreground">
      {LEGEND.map((l) => (
        <li key={l.key} className="flex items-center gap-200">
          <svg viewBox="-14 -14 28 28" className="size-[22px] shrink-0" aria-hidden>{l.icon}</svg>
          {l.label}
        </li>
      ))}
    </ul>
  );
}
