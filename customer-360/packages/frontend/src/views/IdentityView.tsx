import { useMemo, useState } from 'react';
import { Check, GitMerge, X } from 'lucide-react';
import { DATA_STEWARD_EMAILS } from '@rayfin-app/shared';

import { Card, Empty, ErrorNote, Loaded, Skeleton } from '@/components/ui';
import { useAuth } from '@/hooks/auth.context';
import { useQuery } from '@/hooks/use-query';
import {
  fetchMergeCandidates, fetchMergeProposals, proposeMerge, reviewMerge, type MergeCandidateRow, type MergeProposalRow,
} from '@/lib/c360';
import { count, pct, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function IdentityView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { session } = useAuth();
  const email = (session?.user?.email ?? '').toLowerCase();
  const isSteward = DATA_STEWARD_EMAILS.includes(email);
  const [version, setVersion] = useState(0);
  const candidates = useQuery('merge-candidates', fetchMergeCandidates);
  const proposals = useQuery(`merge-proposals:${version}`, fetchMergeProposals);
  const refresh = () => setVersion((v) => v + 1);

  const byCandidate = useMemo(() => {
    const m = new Map<string, MergeProposalRow>();
    for (const p of proposals.data ?? []) if (p.candidateId && !m.has(p.candidateId)) m.set(p.candidateId, p);
    return m;
  }, [proposals.data]);

  return (
    <div className="flex flex-col gap-400">
      <Card title="How identity merges work">
        <ol className="grid grid-cols-1 gap-300 text-300 md:grid-cols-3">
          <li><strong className="font-semibold">1. Review a candidate.</strong> These pairs look like the same person but share no ID or email, so the automatic rules could not link them.</li>
          <li><strong className="font-semibold">2. Propose the merge.</strong> Anyone can propose. Proposals are saved with your name and can't be self-approved unless you're a steward.</li>
          <li><strong className="font-semibold">3. A data steward approves.</strong> Approved merges are applied on the next Fabric rebuild; rejected ones stay as the audit trail.</li>
        </ol>
        <p className="mt-300 text-200 text-muted-foreground">
          Signed in as {email || 'unknown'} · {isSteward ? 'you are a data steward' : 'you can propose merges; a data steward approves them'}.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-400 xl:grid-cols-12">
        <Card className="xl:col-span-7" title="Merge candidates" subtitle="Scored by name, email handle and city. Highest score first.">
          <Loaded q={candidates} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => rows.length
              ? <Candidates rows={rows} byCandidate={byCandidate} email={email} onOpen={onOpenCustomer} onChange={refresh} />
              : <Empty>No merge candidates. Every record was linked automatically.</Empty>}
          </Loaded>
        </Card>
        <Card className="xl:col-span-5" title="Proposals" subtitle={isSteward ? 'Approve or reject pending proposals.' : 'Pending and reviewed proposals.'}>
          <Loaded q={proposals} skeleton={<Skeleton className="h-[calc(var(--spacing-800)*10)]" />}>
            {(rows) => rows.length
              ? <Proposals rows={rows} isSteward={isSteward} email={email} onChange={refresh} />
              : <Empty>No proposals yet.</Empty>}
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

function Side({ label, name, type, emailAddr, city, orders, sources, id, onOpen }: {
  label: string; name?: string | null; type?: string | null; emailAddr?: string | null; city?: string | null;
  orders?: number | null; sources?: number | null; id?: string | null; onOpen: (id: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border p-300">
      <div className="font-heading text-100 font-semibold uppercase tracking-wider text-muted-foreground">{label} · {type}</div>
      <button type="button" onClick={() => id && onOpen(id)}
        className="block max-w-full truncate text-left text-300 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{name}</button>
      <div className="truncate text-200 text-muted-foreground">{emailAddr ?? 'no email'}</div>
      <div className="text-200 text-muted-foreground">{city ?? '—'} · {count(orders ?? 0)} orders · {count(sources ?? 0)} systems</div>
    </div>
  );
}

function Candidates({ rows, byCandidate, email, onOpen, onChange }: {
  rows: MergeCandidateRow[]; byCandidate: Map<string, MergeProposalRow>; email: string;
  onOpen: (id: string) => void; onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const sorted = [...rows].sort((a, b) => n(b.score) - n(a.score)).slice(0, 25);
  const propose = async (c: MergeCandidateRow) => {
    setBusy(c.candidateId ?? ''); setError(null);
    try { await proposeMerge(c, email, notes[c.candidateId ?? ''] ?? ''); onChange(); }
    catch (e) { setError(e instanceof Error ? e : new Error(String(e))); }
    finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-300">
      {error && <ErrorNote error={error} />}
      <p className="text-200 text-muted-foreground">{count(rows.length)} candidates{rows.length > 25 ? ', showing the top 25' : ''}.</p>
      {sorted.map((c) => {
        const existing = byCandidate.get(c.candidateId ?? '');
        return (
          <article key={c.candidateId} className="rounded-lg border border-border p-300">
            <div className="mb-200 flex flex-wrap items-center justify-between gap-200">
              <span className="text-300 font-semibold">Match score {pct(c.score, 0)}</span>
              <span className="text-200 text-muted-foreground">{c.reasons}</span>
            </div>
            <div className="grid grid-cols-1 gap-200 md:grid-cols-2">
              <Side label="Keep" name={c.primaryCustomerName} type={c.primaryCustomerType} emailAddr={c.primaryPrimaryEmail} city={c.primaryCity}
                orders={c.primaryLifetimeOrders} sources={c.primarySourceSystemCount} id={c.primaryCustomerId} onOpen={onOpen} />
              <Side label="Merge in" name={c.secondaryCustomerName} type={c.secondaryCustomerType} emailAddr={c.secondaryPrimaryEmail} city={c.secondaryCity}
                orders={c.secondaryLifetimeOrders} sources={c.secondarySourceSystemCount} id={c.secondaryCustomerId} onOpen={onOpen} />
            </div>
            <div className="mt-200 flex flex-wrap items-center gap-200">
              {existing ? (
                <span className="text-200 font-semibold">{existing.status ? `${existing.status} by ${existing.reviewedBy}` : `Proposed by ${existing.proposedBy}, awaiting a steward`}</span>
              ) : (
                <>
                  <input value={notes[c.candidateId ?? ''] ?? ''} onChange={(e) => setNotes({ ...notes, [c.candidateId ?? '']: e.target.value })}
                    placeholder="Why these are the same customer (optional)" aria-label="Note for this proposal" maxLength={1000}
                    className="min-w-0 flex-1 rounded-md border border-input bg-card px-200 py-100 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <button type="button" disabled={busy !== null || !email} onClick={() => void propose(c)}
                    className="inline-flex items-center gap-100 rounded-md bg-primary px-300 py-100 text-300 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                    <GitMerge aria-hidden className="icon-size-200" />{busy === c.candidateId ? 'Proposing…' : 'Propose merge'}
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Proposals({ rows, isSteward, email, onChange }: { rows: MergeProposalRow[]; isSteward: boolean; email: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const decide = async (p: MergeProposalRow, decision: 'Approved' | 'Rejected') => {
    setBusy(p.id ?? ''); setError(null);
    try { await reviewMerge(p.id ?? '', decision, email, ''); onChange(); }
    catch (e) { setError(e instanceof Error ? e : new Error(String(e))); }
    finally { setBusy(null); }
  };
  const pending = rows.filter((r) => !r.status);
  const done = rows.filter((r) => r.status);
  return (
    <div className="flex flex-col gap-300">
      {error && <ErrorNote error={error} />}
      <h3 className="font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Pending ({count(pending.length)})</h3>
      {pending.length === 0 && <p className="text-300 text-muted-foreground">Nothing waiting for review.</p>}
      {pending.map((p) => (
        <article key={p.id} className="rounded-md border border-border p-300 text-300">
          <div><strong className="font-semibold">{p.secondaryName}</strong> → <strong className="font-semibold">{p.primaryName}</strong></div>
          <div className="text-200 text-muted-foreground">Proposed by {p.proposedBy} · {shortDate(p.proposedAt)} · score {pct(p.matchScore, 0)}</div>
          {p.note && <p className="mt-100 text-200">“{p.note}”</p>}
          {isSteward && (
            <div className="mt-200 flex gap-200">
              <button type="button" disabled={busy !== null} onClick={() => void decide(p, 'Approved')}
                className="inline-flex items-center gap-100 rounded-md bg-primary px-300 py-100 text-300 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                <Check aria-hidden className="icon-size-200" />Approve
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void decide(p, 'Rejected')}
                className="inline-flex items-center gap-100 rounded-md border border-border px-300 py-100 text-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                <X aria-hidden className="icon-size-200" />Reject
              </button>
            </div>
          )}
        </article>
      ))}
      <h3 className="mt-200 font-heading text-200 font-semibold uppercase tracking-wider text-muted-foreground">Reviewed ({count(done.length)})</h3>
      <ul className="divide-y divide-border">
        {done.slice(0, 20).map((p) => (
          <li key={p.id} className="py-200 text-300">
            <span className={cn('mr-200 rounded-sm px-100 text-200 font-semibold',
              p.status === 'Approved' ? 'bg-[color:var(--color-status-good)]/15 text-[color:var(--color-status-good)]' : 'bg-muted text-muted-foreground')}>{p.status}</span>
            {p.secondaryName} → {p.primaryName}
            <div className="text-200 text-muted-foreground">by {p.reviewedBy} · {shortDate(p.reviewedAt)}{p.status === 'Approved' ? ' · applied on the next rebuild' : ''}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
