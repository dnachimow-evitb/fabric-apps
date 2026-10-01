// Renders product line snapshots to PDF (jsPDF) or PowerPoint (PptxGenJS) in the browser.
// One layout drives both formats through a tiny Painter interface (rectangles + single-line text on a
// 13.333 × 7.5 in page, the PowerPoint widescreen size), so the PDF page and the slide match.
// The libraries are loaded on demand so they stay out of the main bundle. A third painter draws the same
// layout as SVG for the on-page preview, so previews don't depend on the browser's PDF viewer (which Chrome
// blocks inside a page when it is set to download PDFs or the viewer is disabled by policy).
import { count, money, pct } from './format';
import { slug, type LineSnapshot, type SkuLine } from './product-line-report';

export type ReportFormat = 'pdf' | 'pptx';

export interface ReportFile {
  id: string;
  name: string;
  format: ReportFormat;
  lines: string[];
  blob: Blob;
  url: string;
  createdAt: Date;
  /** One SVG data URL per page or slide, for the preview. */
  pages: string[];
}

const W = 13.333;
const H = 7.5;
const M = 0.5;

// Light-theme tokens from global.css (files are printed and shared, so they don't follow dark mode).
const C = {
  header: '1D2025', headerFg: 'F4F3F0', primary: 'C2410C', text: '1D2025', muted: '5B6067', border: 'DCD9D3',
  card: 'FFFFFF', page: 'FAF9F7', wholesale: '1C6FB8', direct: 'D9480F', track: 'EEECE8',
  good: '2B8A3E', warn: '9A6700', critical: 'C92A2A',
};

interface TextOpts { size: number; color?: string; bold?: boolean; align?: 'left' | 'right' | 'center' }
interface Painter {
  rect(x: number, y: number, w: number, h: number, fill: string, stroke?: string): void;
  /** Single line of text whose top-left (or top-right / top-centre) corner is at x, y, clipped to width w. */
  text(s: string, x: number, y: number, w: number, o: TextOpts): void;
}

/** Shortens a string to roughly fit a width (both formats use a Helvetica-class font). */
export function clip(s: string, w: number, size: number, bold = false): string {
  const max = Math.max(3, Math.floor(w / ((size / 72) * (bold ? 0.56 : 0.5))));
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Signed percentage in plain ASCII (the PDF's standard fonts have no ▲ ▼ glyphs). */
export function signed(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : '-'}${Math.abs(v * 100).toFixed(digits)}%`;
}

const RISK: Record<string, string> = { High: C.critical, Medium: C.warn, Low: C.good };
const TYPE_COLOR: Record<string, string> = { Wholesale: C.wholesale, Direct: C.direct };
const TYPE_LABEL: Record<string, string> = { Wholesale: 'Wholesale (B2B)', Direct: 'Direct (B2C)' };

function panel(p: Painter, x: number, y: number, w: number, h: number, title: string, subtitle?: string) {
  p.rect(x, y, w, h, C.card, C.border);
  p.text(title.toUpperCase(), x + 0.2, y + 0.16, w - 0.4, { size: 9, bold: true });
  if (subtitle) p.text(subtitle, x + 0.2, y + 0.36, w - 0.4, { size: 8, color: C.muted });
}

function empty(p: Painter, x: number, y: number, w: number, msg: string) {
  p.text(msg, x + 0.2, y, w - 0.4, { size: 9, color: C.muted });
}

export function paintSnapshot(p: Painter, s: LineSnapshot, generatedAt: Date) {
  p.rect(0, 0, W, H, C.page);

  // Header band
  p.rect(0, 0, W, 0.95, C.header);
  p.rect(0, 0.95, W, 0.06, C.primary);
  p.text('CONTOSO HARDWARE  ·  CUSTOMER 360', M, 0.17, 6, { size: 9, bold: true, color: C.headerFg });
  p.text(s.line, M, 0.4, 8, { size: 24, bold: true, color: 'FFFFFF' });
  p.text('PRODUCT LINE SNAPSHOT', W - M, 0.2, 4, { size: 9, bold: true, color: C.headerFg, align: 'right' });
  p.text('Last 12 months to Sep 2026', W - M, 0.44, 4, { size: 12, color: 'FFFFFF', align: 'right' });

  const filters = s.filters.length ? s.filters.join('  ·  ') : 'All customers';
  p.text(clip(`Filters: ${filters}`, 8.6, 9), M, 1.15, 8.6, { size: 9, color: C.muted });
  const stamp = generatedAt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  p.text(`Fictional test data  ·  Generated ${stamp}`, W - M, 1.15, 4, { size: 9, color: C.muted, align: 'right' });

  // KPI tiles
  const kpis: [string, string, string][] = [
    ['Net sales', money(s.netSales), `${signed(s.yoy)} vs prior 12 months`],
    ['Share of sales', pct(s.shareOfSales), 'of these customers\' sales'],
    ['Buyers', count(s.buyers), `${pct(s.penetration, 0)} of ${count(s.activeCustomers)} active customers`],
    ['Avg spend / buyer', money(s.avgSpendPerBuyer), `${count(s.units)} units sold`],
    ['Return rate', pct(s.returnRate), `${money(s.returns)} refunded`],
    ['Upsell pipeline', money(s.upsellValue), `${count(s.upsellTargets)} customers not buying yet`],
  ];
  const gap = 0.15;
  const tw = (W - 2 * M - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach(([label, value, detail], i) => {
    const x = M + i * (tw + gap);
    const y = 1.5;
    p.rect(x, y, tw, 1.1, C.card, C.border);
    if (i === 0) p.rect(x, y, tw, 0.05, C.primary);
    p.text(label.toUpperCase(), x + 0.15, y + 0.15, tw - 0.3, { size: 8, bold: true, color: C.muted });
    p.text(value, x + 0.15, y + 0.36, tw - 0.3, { size: 20, bold: true });
    p.text(clip(detail, tw - 0.3, 8), x + 0.15, y + 0.8, tw - 0.3, { size: 8, color: C.muted });
  });

  const lx = M;
  const lw = 6.75;
  const rx = lx + lw + 0.15;
  const rw = W - M - rx;

  // Top SKUs
  {
    const y = 2.8;
    panel(p, lx, y, lw, 2.55, 'Top SKUs by net sales', 'Last 12 months, with change vs the prior 12 months');
    if (!s.topSkus.length) empty(p, lx, y + 0.7, lw, 'No sales of this line under these filters.');
    const max = Math.max(...s.topSkus.map((k) => k.netSales), 1);
    const bx = lx + 2.85;
    const bw = lw - 2.85 - 1.75;
    s.topSkus.forEach((k, i) => {
      const ry = y + 0.68 + i * 0.3;
      p.text(clip(k.name, 2.55, 8.5), lx + 0.2, ry, 2.55, { size: 8.5 });
      p.rect(bx, ry + 0.02, bw, 0.16, C.track);
      p.rect(bx, ry + 0.02, Math.max(0.02, (k.netSales / max) * bw), 0.16, C.wholesale);
      p.text(money(k.netSales), bx + bw + 0.1, ry, 0.8, { size: 8.5, bold: true });
      p.text(`${signed(k.yoy)} YoY`, lx + lw - 0.2, ry, 0.8, { size: 8.5, color: (k.yoy ?? 0) >= 0 ? C.good : C.critical, align: 'right' });
    });
  }

  // Return watch list
  {
    const y = 5.5;
    panel(p, lx, y, lw, 1.45, 'Return watch list', 'Highest return rates among SKUs with at least 2% of line sales');
    if (!s.returnWatch.length) empty(p, lx, y + 0.66, lw, 'No returns recorded for this line under these filters.');
    s.returnWatch.forEach((k: SkuLine, i) => {
      const ry = y + 0.66 + i * 0.25;
      p.text(clip(k.name, 3.7, 8.5), lx + 0.2, ry, 3.7, { size: 8.5 });
      p.text(`${pct(k.returnRate)} returned`, lx + lw - 1.45, ry, 1.4, { size: 8.5, bold: true, color: C.critical, align: 'right' });
      p.text(`${money(k.netSales)} sales`, lx + lw - 0.2, ry, 1.1, { size: 8.5, color: C.muted, align: 'right' });
    });
  }

  // Sales by customer type
  {
    const y = 2.8;
    panel(p, rx, y, rw, 1.05, 'Sales by customer type');
    const max = Math.max(...s.byType.map((t) => t.netSales), 1);
    const bx = rx + 2.45;
    const bw = rw - 2.45 - 1.0;
    if (!s.byType.length) empty(p, rx, y + 0.5, rw, 'No sales under these filters.');
    s.byType.slice(0, 2).forEach((t, i) => {
      const ry = y + 0.48 + i * 0.3;
      p.text(clip(`${TYPE_LABEL[t.type] ?? t.type}  ·  ${count(t.buyers)} buyers`, 2.2, 8.5), rx + 0.2, ry, 2.2, { size: 8.5 });
      p.rect(bx, ry + 0.02, bw, 0.16, C.track);
      p.rect(bx, ry + 0.02, Math.max(0.02, (t.netSales / max) * bw), 0.16, TYPE_COLOR[t.type] ?? C.muted);
      p.text(money(t.netSales), rx + rw - 0.2, ry, 0.8, { size: 8.5, bold: true, align: 'right' });
    });
  }

  // Top customers
  {
    const y = 4.0;
    const risk = s.highRiskBuyers
      ? `${count(s.highRiskBuyers)} high-risk buyers hold ${money(s.highRiskSales)} of this line's sales`
      : 'No high-risk buyers of this line';
    panel(p, rx, y, rw, 1.7, 'Top customers for this line', risk);
    const cols = { name: rx + 0.2, type: rx + 2.75, sales: rx + rw - 1.25, risk: rx + rw - 0.2 };
    p.text('CUSTOMER', cols.name, y + 0.6, 2.4, { size: 7, bold: true, color: C.muted });
    p.text('TYPE', cols.type, y + 0.6, 1, { size: 7, bold: true, color: C.muted });
    p.text('LINE SALES', cols.sales, y + 0.6, 1, { size: 7, bold: true, color: C.muted, align: 'right' });
    p.text('CHURN RISK', cols.risk, y + 0.6, 1, { size: 7, bold: true, color: C.muted, align: 'right' });
    if (!s.topCustomers.length) empty(p, rx, y + 0.82, rw, 'No buyers under these filters.');
    s.topCustomers.forEach((c, i) => {
      const ry = y + 0.82 + i * 0.165;
      p.text(clip(c.name, 2.45, 8), cols.name, ry, 2.45, { size: 8 });
      p.text(c.type, cols.type, ry, 1, { size: 8, color: C.muted });
      p.text(money(c.netSales), cols.sales, ry, 1, { size: 8, bold: true, align: 'right' });
      p.text(`${c.riskBand}${c.riskScore != null ? ` · ${Math.round(c.riskScore)}` : ''}`, cols.risk, ry, 1, { size: 8, bold: true, color: RISK[c.riskBand] ?? C.muted, align: 'right' });
    });
  }

  // Upsell targets
  {
    const y = 5.85;
    panel(p, rx, y, rw, 1.1, 'Upsell targets', 'Customers likely to start buying this line, by estimated annual value');
    if (!s.topUpsell.length) empty(p, rx, y + 0.6, rw, 'No upsell targets under these filters.');
    s.topUpsell.forEach((u, i) => {
      const ry = y + 0.58 + i * 0.15;
      p.text(clip(u.name, 2.45, 8), rx + 0.2, ry, 2.45, { size: 8 });
      p.text(u.type, rx + 2.75, ry, 1, { size: 8, color: C.muted });
      p.text(`${money(u.value)} / yr`, rx + rw - 0.2, ry, 1.2, { size: 8, bold: true, align: 'right' });
    });
  }

  p.text('Source: c360_lakehouse gold_customer_sku, gold_customer_metrics, gold_customer_upsell. Figures are trailing 12 months; the dashboard date range does not apply.',
    M, 7.12, W - 2 * M, { size: 7, color: C.muted });
}

// ---------------------------------------------------------------------------------------------
// Format adapters

const PX = 96; // SVG user units per inch
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page as an SVG data URL (shown in an <img>, so it needs no plugin and runs no script). */
export function snapshotSvg(s: LineSnapshot, generatedAt: Date): string {
  const parts: string[] = [];
  const f = (v: number) => +(v * PX).toFixed(2);
  paintSnapshot({
    rect(x, y, w, h, fill, stroke) {
      parts.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#${fill}"${stroke ? ` stroke="#${stroke}" stroke-width="1"` : ''}/>`);
    },
    text(t, x, y, _w, o) {
      const anchor = o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : 'start';
      parts.push(`<text x="${f(x)}" y="${f(y)}" font-size="${+(o.size * PX / 72).toFixed(2)}" fill="#${o.color ?? C.text}"${o.bold ? ' font-weight="700"' : ''} text-anchor="${anchor}" dominant-baseline="hanging">${esc(t)}</text>`);
    },
  }, s, generatedAt);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderPdf(snapshots: LineSnapshot[], generatedAt: Date): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [W, H] });
  doc.setProperties({ title: `${snapshots.map((s) => s.line).join(', ')}: product line snapshot`, creator: 'Contoso Customer 360' });
  const painter: Painter = {
    rect(x, y, w, h, fill, stroke) {
      doc.setFillColor(`#${fill}`);
      if (stroke) { doc.setDrawColor(`#${stroke}`); doc.setLineWidth(0.01); }
      doc.rect(x, y, w, h, stroke ? 'FD' : 'F');
    },
    text(s, x, y, _w, o) {
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
      doc.setFontSize(o.size);
      doc.setTextColor(`#${o.color ?? C.text}`);
      doc.text(s, x, y, { baseline: 'top', align: o.align ?? 'left' });
    },
  };
  snapshots.forEach((s, i) => {
    if (i > 0) doc.addPage([W, H], 'landscape');
    paintSnapshot(painter, s, generatedAt);
  });
  return doc.output('blob');
}

async function renderPptx(snapshots: LineSnapshot[], generatedAt: Date): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `${snapshots.map((s) => s.line).join(', ')}: product line snapshot`;
  pres.company = 'Contoso Hardware (fictional)';
  for (const s of snapshots) {
    const slide = pres.addSlide();
    const painter: Painter = {
      rect(x, y, w, h, fill, stroke) {
        slide.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: stroke ? { color: stroke, width: 0.75 } : { type: 'none' } });
      },
      text(t, x, y, w, o) {
        const align = o.align ?? 'left';
        const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        slide.addText(t, {
          x: left, y, w, h: (o.size / 72) * 1.35, fontSize: o.size, bold: !!o.bold, color: o.color ?? C.text,
          fontFace: 'Arial', align, valign: 'top', margin: 0, wrap: false,
        });
      },
    };
    paintSnapshot(painter, s, generatedAt);
  }
  return (await pres.write({ outputType: 'blob' })) as Blob;
}

const MIME: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Renders one file holding a page (PDF) or slide (PowerPoint) per snapshot. */
export async function renderReport(snapshots: LineSnapshot[], format: ReportFormat, generatedAt = new Date()): Promise<ReportFile> {
  const raw = format === 'pdf' ? await renderPdf(snapshots, generatedAt) : await renderPptx(snapshots, generatedAt);
  const blob = raw.type === MIME[format] ? raw : new Blob([raw], { type: MIME[format] });
  // Local calendar date (toISOString would give tomorrow's date in the evening, US time).
  const pad = (v: number) => String(v).padStart(2, '0');
  const day = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}`;
  const lines = snapshots.map((s) => s.line);
  const base = lines.length === 1 ? slug(lines[0]) : `${lines.length}-product-lines`;
  return {
    id: crypto.randomUUID(),
    name: `Contoso-${base}-snapshot-${day}.${format}`,
    format,
    lines,
    blob,
    url: URL.createObjectURL(blob),
    createdAt: generatedAt,
    pages: snapshots.map((s) => snapshotSvg(s, generatedAt)),
  };
}
