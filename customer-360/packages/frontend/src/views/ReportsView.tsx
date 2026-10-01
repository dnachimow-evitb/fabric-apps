// Reports: pick product lines and a format, then generate a one-page snapshot per line under the current filters.
// Everything runs in the browser: data comes from the lakehouse connector, files are rendered by
// lib/report-render.ts and kept as in-memory blobs (they last until the page is refreshed).
import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  AlertTriangle, CircleCheck, Download, Eye, EyeOff, ExternalLink, FileText, LoaderCircle, Presentation, Trash2,
} from 'lucide-react';

import { Card, Empty, Loaded, Skeleton } from '@/components/ui';
import type { QueryState } from '@/hooks/use-query';
import { fetchLineSkuRows, fetchLineUpsell, type Filters, type MetricRow } from '@/lib/c360';
import { count } from '@/lib/format';
import { buildSnapshot, describeFilters, type LineSnapshot } from '@/lib/product-line-report';
import { renderReport, type ReportFile, type ReportFormat } from '@/lib/report-render';
import { cn } from '@/lib/utils';

type StepStatus = 'queued' | 'loading' | 'rendering' | 'done' | 'error';
interface Step { line: string; status: StepStatus; error?: string }

const BUTTON = 'inline-flex items-center gap-100 rounded-md px-300 py-100 text-300 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`;
const SECONDARY = `${BUTTON} border border-border hover:bg-accent`;
const LABEL = 'font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground';

const FORMAT_LABEL: Record<ReportFormat, string> = { pdf: 'PDF', pptx: 'PowerPoint' };

export function ReportsView({ filters, metrics, productLines, files, onFiles }: {
  filters: Filters;
  metrics: QueryState<MetricRow[]>;
  productLines: string[];
  files: ReportFile[];
  onFiles: Dispatch<SetStateAction<ReportFile[]>>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [combine, setCombine] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const toggle = (line: string) => setSelected((s) => (s.includes(line) ? s.filter((x) => x !== line) : [...s, line]));
  const ordered = productLines.filter((l) => selected.includes(l));
  const fileCount = combine ? Math.min(1, ordered.length) : ordered.length;
  const active = describeFilters(filters);

  async function generate(rows: MetricRow[]) {
    // Capture the inputs: changing filters mid-run must not mix two filter sets in one batch.
    const lines = ordered;
    const f = filters;
    const fmt = format;
    const together = combine;
    const at = new Date();
    const set = (line: string, status: StepStatus, error?: string) =>
      setSteps((s) => s.map((x) => (x.line === line ? { ...x, status, error } : x)));

    setRunning(true);
    setSteps(lines.map((line) => ({ line, status: 'queued' })));
    const snapshots: LineSnapshot[] = [];
    const made: ReportFile[] = [];
    for (const line of lines) {
      try {
        set(line, 'loading');
        const [skuRows, upsell] = await Promise.all([fetchLineSkuRows(line, f), fetchLineUpsell(line)]);
        const snap = buildSnapshot(line, f, rows, skuRows, upsell);
        if (together) {
          snapshots.push(snap);
        } else {
          set(line, 'rendering');
          made.push(await renderReport([snap], fmt, at));
        }
        set(line, 'done');
      } catch (e) {
        set(line, 'error', e instanceof Error ? e.message : String(e));
      }
    }
    if (together && snapshots.length) {
      try {
        made.push(await renderReport(snapshots, fmt, at));
      } catch (e) {
        for (const s of snapshots) set(s.line, 'error', e instanceof Error ? e.message : String(e));
      }
    }
    onFiles((prev) => [...made, ...prev]);
    if (made[0]) setPreview(made[0].id);
    setRunning(false);
  }

  const remove = (file: ReportFile) => {
    URL.revokeObjectURL(file.url);
    if (preview === file.id) setPreview(null);
    onFiles((prev) => prev.filter((x) => x.id !== file.id));
  };

  return (
    <div className="flex flex-col gap-400">
      <Card title="Product line reports"
        subtitle="Choose product lines and a format. Each line becomes a one-page snapshot of its key metrics under the filters above.">
        <div className="flex flex-col gap-500">
          <fieldset className="flex flex-col gap-200">
            <div className="flex flex-wrap items-center justify-between gap-200">
              <legend className={LABEL}>Product lines ({selected.length} of {productLines.length})</legend>
              <div className="flex gap-300 text-200">
                <button type="button" onClick={() => setSelected(productLines)} className="font-semibold underline-offset-4 hover:underline">Select all</button>
                <button type="button" onClick={() => setSelected([])} className="font-semibold underline-offset-4 hover:underline">Clear</button>
              </div>
            </div>
            {productLines.length ? (
              <div className="grid grid-cols-1 gap-200 sm:grid-cols-2 lg:grid-cols-3">
                {productLines.map((line) => (
                  <label key={line}
                    className={cn('flex cursor-pointer items-center gap-200 rounded-md border px-300 py-200 text-300',
                      selected.includes(line) ? 'border-foreground bg-muted font-semibold' : 'border-border hover:bg-muted')}>
                    <input type="checkbox" checked={selected.includes(line)} onChange={() => toggle(line)}
                      className="size-400 accent-[color:var(--color-primary)]" />
                    {line}
                  </label>
                ))}
              </div>
            ) : <Skeleton className="h-[calc(var(--spacing-800)*3)]" />}
          </fieldset>

          <div className="flex flex-wrap items-end gap-500">
            <fieldset className="flex flex-col gap-200">
              <legend className={cn(LABEL, 'mb-200')}>Format</legend>
              <div className="inline-flex rounded-md border border-border p-100" role="radiogroup" aria-label="Format">
                {(['pdf', 'pptx'] as const).map((f) => {
                  const Icon = f === 'pdf' ? FileText : Presentation;
                  return (
                    <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}
                      className={cn('inline-flex items-center gap-100 rounded-md px-300 py-100 text-300 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        format === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                      <Icon aria-hidden className="icon-size-200" />{FORMAT_LABEL[f]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex items-center gap-200 py-100 text-300">
              <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)}
                className="size-400 accent-[color:var(--color-primary)]" />
              Combine into one file ({format === 'pdf' ? 'a page' : 'a slide'} per line)
            </label>
            <div className="ml-auto flex flex-col items-end gap-100">
              <Loaded q={metrics} skeleton={<button type="button" disabled className={PRIMARY}>Loading customers…</button>}>
                {(rows) => (
                  <button type="button" disabled={running || !ordered.length} onClick={() => void generate(rows)} className={PRIMARY}>
                    {running ? <LoaderCircle aria-hidden className="icon-size-200 animate-spin" /> : <Download aria-hidden className="icon-size-200" />}
                    {running ? 'Generating…' : ordered.length ? `Generate ${fileCount} ${FORMAT_LABEL[format]} file${fileCount === 1 ? '' : 's'}` : 'Select product lines'}
                  </button>
                )}
              </Loaded>
              {metrics.data && <span className="text-200 text-muted-foreground">{count(metrics.data.length)} customers match the filters</span>}
            </div>
          </div>

          <p className="text-200 text-muted-foreground">
            Filters applied: <span className="font-semibold text-foreground">{active.length ? active.join(' · ') : 'none (all customers)'}</span>.
            Figures are the last 12 months to Sep 2026; product line data has no monthly detail, so there is no date filter here.
          </p>
        </div>
      </Card>

      {steps.length > 0 && (
        <Card title={running ? 'Generating' : 'Last run'}>
          <ul className="grid grid-cols-1 gap-200 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => <StepRow key={s.line} step={s} />)}
          </ul>
        </Card>
      )}

      <Card title="Generated files" subtitle="Kept in this browser tab until you refresh the page. PowerPoint files open in PowerPoint after downloading.">
        {files.length ? (
          <div className="flex flex-col gap-400">
            <div className="overflow-x-auto">
              <table className="w-full text-300">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className={cn(LABEL, 'py-200 pr-300')}>File</th>
                    <th className={cn(LABEL, 'py-200 pr-300')}>Product lines</th>
                    <th className={cn(LABEL, 'py-200 pr-300 text-right')}>Size</th>
                    <th className={cn(LABEL, 'py-200 pr-300')}>Created</th>
                    <th className={cn(LABEL, 'py-200 text-right')}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="py-200 pr-300">
                        <span className="inline-flex items-center gap-100 font-semibold">
                          {f.format === 'pdf' ? <FileText aria-hidden className="icon-size-200" /> : <Presentation aria-hidden className="icon-size-200" />}
                          {f.name}
                        </span>
                      </td>
                      <td className="py-200 pr-300 text-muted-foreground">{f.lines.join(', ')}</td>
                      <td className="py-200 pr-300 text-right tabular-nums">{Math.max(1, Math.round(f.blob.size / 1024)).toLocaleString()} KB</td>
                      <td className="py-200 pr-300 text-muted-foreground">{f.createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="py-200">
                        <div className="flex justify-end gap-200">
                          <button type="button" onClick={() => setPreview(preview === f.id ? null : f.id)} className={SECONDARY} aria-pressed={preview === f.id}>
                            {preview === f.id ? <EyeOff aria-hidden className="icon-size-200" /> : <Eye aria-hidden className="icon-size-200" />}
                            {preview === f.id ? 'Hide' : 'Preview'}
                          </button>
                          {f.format === 'pdf' && (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
                              <ExternalLink aria-hidden className="icon-size-200" />Open
                            </a>
                          )}
                          <a href={f.url} download={f.name} className={f.format === 'pptx' ? PRIMARY : SECONDARY}>
                            <Download aria-hidden className="icon-size-200" />{f.format === 'pptx' ? 'Open in PowerPoint' : 'Download'}
                          </a>
                          <button type="button" onClick={() => remove(f)} className={SECONDARY} aria-label={`Remove ${f.name}`}>
                            <Trash2 aria-hidden className="icon-size-200" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const shown = files.find((f) => f.id === preview);
              return shown ? (
                <figure className="flex flex-col gap-300">
                  <figcaption className="text-200 text-muted-foreground">
                    Preview of <span className="font-semibold text-foreground">{shown.name}</span>
                    {shown.pages.length > 1 ? ` (${shown.pages.length} ${shown.format === 'pdf' ? 'pages' : 'slides'})` : ''}
                  </figcaption>
                  {shown.pages.map((src, i) => (
                    <img key={i} src={src} alt={`${shown.lines[i] ?? ''} snapshot, ${shown.format === 'pdf' ? 'page' : 'slide'} ${i + 1}`}
                      className="w-full rounded-md border border-border shadow-sm" />
                  ))}
                </figure>
              ) : null;
            })()}
          </div>
        ) : (
          <Empty>No files yet. Pick product lines above and generate.</Empty>
        )}
      </Card>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const icon = step.status === 'done'
    ? <CircleCheck aria-hidden className="icon-size-200 text-[color:var(--color-status-good)]" />
    : step.status === 'error'
      ? <AlertTriangle aria-hidden className="icon-size-200 text-[color:var(--color-status-critical)]" />
      : step.status === 'queued'
        ? <span aria-hidden className="inline-block size-200 rounded-full border border-border" />
        : <LoaderCircle aria-hidden className="icon-size-200 animate-spin" />;
  const label = { queued: 'Waiting', loading: 'Fetching data', rendering: 'Rendering', done: 'Done', error: 'Failed' }[step.status];
  return (
    <li className="flex items-start gap-200 rounded-md border border-border px-300 py-200 text-300">
      <span className="pt-[2px]">{icon}</span>
      <span className="min-w-0">
        <span className="font-semibold">{step.line}</span>
        <span className="block text-200 text-muted-foreground">{label}{step.error ? `: ${step.error}` : ''}</span>
      </span>
    </li>
  );
}
