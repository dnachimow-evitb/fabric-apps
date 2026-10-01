import { describe, expect, it } from 'vitest';

import { ALL_FILTERS, type LineSkuRow, type MetricRow } from './c360';
import { buildSnapshot } from './product-line-report';
import { clip, paintSnapshot, renderReport, signed } from './report-render';

const snapshot = buildSnapshot('Power Tools', ALL_FILTERS,
  [{ unifiedCustomerId: 'A', customerName: 'Rosen Supply Co.', customerType: 'Wholesale', netSalesTtm: 5000, churnRiskBand: 'Medium', churnRiskScore: 40 } as MetricRow],
  [{ unifiedCustomerId: 'A', customerType: 'Wholesale', sku: 'PT-1', productName: '18V Cordless Drill', netSalesTtm: 1200, netSalesPriorTtm: 1000, unitsTtm: 8, returnsTtm: 60 } as LineSkuRow],
  []);

// jsdom has no object URLs.
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';

describe('helpers', () => {
  it('formats signed percentages in ASCII', () => {
    expect(signed(0.125)).toBe('+13%');
    expect(signed(-0.05, 1)).toBe('-5.0%');
    expect(signed(null)).toBe('n/a');
  });

  it('clips long text with an ellipsis', () => {
    expect(clip('short', 2, 9)).toBe('short');
    const long = clip('A very long product name that will not fit in the column', 1, 9);
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThan(20);
  });
});

describe('paintSnapshot', () => {
  it('keeps everything on the 13.333 × 7.5 in page', () => {
    const boxes: [number, number, number, number][] = [];
    const texts: string[] = [];
    paintSnapshot({
      rect: (x, y, w, h) => boxes.push([x, y, w, h]),
      text: (s, x, y) => { texts.push(s); boxes.push([x, y, 0, 0]); },
    }, snapshot, new Date('2026-09-30T12:00:00Z'));
    for (const [x, y, w, h] of boxes) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(13.334);
      expect(y + h).toBeLessThanOrEqual(7.5);
    }
    expect(texts).toContain('Power Tools');
    expect(texts).toContain('Rosen Supply Co.');
    expect(texts.some((t) => t.startsWith('Fictional test data'))).toBe(true);
  });
});

describe('renderReport', () => {
  it('produces a PDF file', async () => {
    const f = await renderReport([snapshot, { ...snapshot, line: 'Hand Tools' }], 'pdf', new Date('2026-09-30T12:00:00Z'));
    expect(f.name).toBe('Contoso-2-product-lines-snapshot-2026-09-30.pdf');
    expect(f.blob.type).toBe('application/pdf');
    const head = new TextDecoder().decode(new Uint8Array(await f.blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('produces a PowerPoint file', async () => {
    const f = await renderReport([snapshot], 'pptx', new Date('2026-09-30T12:00:00Z'));
    expect(f.name).toBe('Contoso-Power-Tools-snapshot-2026-09-30.pptx');
    const head = new Uint8Array(await f.blob.arrayBuffer()).slice(0, 2);
    expect([...head]).toEqual([0x50, 0x4b]); // "PK": a zip package
  }, 20000);
});
