import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquareText, RotateCcw, Send, X } from 'lucide-react';

import { getRayfinClient } from '@/lib/rayfin-client';
import { runQuery, type QueryInput } from '@/lib/qa';
import { cn } from '@/lib/utils';

/** Anthropic message shapes, kept loose here: the function validates them and echoes model content back unchanged. */
interface ContentBlock { type: string; id?: string; name?: string; input?: unknown; text?: string }
type ApiMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] | Record<string, unknown>[] };

interface Exchange {
  question: string;
  answer: string;
  steps: string[];
  state: 'thinking' | 'done' | 'error';
}

const MAX_TOOL_ROUNDS = 8;
const SUGGESTIONS = [
  'Which 5 wholesale accounts have the most revenue at risk, and why?',
  'Which SKUs have the highest return rate this year?',
  'Do customers with support spikes disengage from marketing before their sales drop?',
  'Where is revenue at risk concentrated by region?',
];

export function AskPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const messages = useRef<ApiMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [exchanges]);

  const update = (patch: Partial<Exchange>) =>
    setExchanges((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, ...patch, steps: patch.steps ?? x.steps } : x)));

  const reset = () => { messages.current = []; setExchanges([]); };

  async function ask(q: string) {
    const text = q.trim().slice(0, 2000);
    if (!text || busy) return;
    setBusy(true);
    setQuestion('');
    setExchanges((xs) => [...xs, { question: text, answer: '', steps: [], state: 'thinking' }]);
    const before = messages.current.length;
    messages.current = [...messages.current, { role: 'user', content: text }];
    const steps: string[] = [];
    try {
      const client = await getRayfinClient();
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const turn = await client.functions.askCustomer360.invoke(
          { conversationJson: JSON.stringify(messages.current) },
          { timeoutMs: 240_000 },
        );
        if (turn.status !== 'ok') {
          messages.current = messages.current.slice(0, before); // drop the unanswered question from the history
          update({ answer: turn.message, state: 'error' });
          return;
        }
        const content = JSON.parse(turn.contentJson) as ContentBlock[];
        messages.current = [...messages.current, { role: 'assistant', content }];
        const calls = content.filter((b) => b.type === 'tool_use');
        if (turn.stopReason !== 'tool_use' || calls.length === 0) {
          const answer = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
          update({ answer: answer || 'No answer was returned. Try rephrasing the question.', state: answer ? 'done' : 'error', steps: [...steps] });
          return;
        }
        if (round === MAX_TOOL_ROUNDS) break;
        const results = await Promise.all(calls.map(async (c) => {
          const r = await runQuery(c.input as QueryInput);
          steps.push(r.summary);
          return { type: 'tool_result', tool_use_id: c.id, content: r.content, is_error: !r.ok };
        }));
        update({ steps: [...steps] });
        messages.current = [...messages.current, { role: 'user', content: results }];
      }
      update({ answer: 'This question needed too many lookups. Try a narrower question.', state: 'error', steps: [...steps] });
    } catch (error) {
      messages.current = messages.current.slice(0, before);
      update({ answer: error instanceof Error ? `Q&A failed: ${error.message}` : 'Q&A failed.', state: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(question); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask a question about the data"
        className={cn('fixed right-600 bottom-600 z-30 inline-flex items-center gap-200 rounded-full bg-primary px-500 py-300 font-heading text-300 font-semibold uppercase tracking-wider text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'hidden')}>
        <MessageSquareText aria-hidden className="icon-size-300" /> Ask
      </button>

      {open && (
        <aside role="dialog" aria-label="Ask the Customer 360 data"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[calc(var(--spacing-800)*15)] flex-col border-l border-border bg-card text-card-foreground shadow-2xl">
          <header className="flex items-center justify-between gap-300 border-b-4 border-primary bg-[color:var(--color-header)] px-500 py-300 text-[color:var(--color-header-foreground)]">
            <div>
              <h2 className="font-heading text-400 font-semibold uppercase tracking-wider">Ask Customer 360</h2>
              <p className="text-200 opacity-80">Answers from the gold tables, powered by Claude</p>
            </div>
            <div className="flex gap-100">
              <button type="button" onClick={reset} disabled={busy} aria-label="Start a new conversation"
                className="rounded-md p-100 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                <RotateCcw className="icon-size-200" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="rounded-md p-100 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="icon-size-200" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-400 overflow-y-auto p-500" aria-live="polite">
            {exchanges.length === 0 && (
              <div>
                <p className="mb-300 text-300 text-muted-foreground">Ask anything about customers, SKUs, returns, marketing or support. For example:</p>
                <ul className="flex flex-col gap-200">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => void ask(s)} disabled={busy}
                        className="w-full rounded-md border border-border px-300 py-200 text-left text-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{s}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {exchanges.map((x, i) => (
              <article key={i} className="flex flex-col gap-200">
                <p className="self-end rounded-lg bg-muted px-300 py-200 text-300">{x.question}</p>
                {x.state === 'thinking' && (
                  <p className="text-200 text-muted-foreground">
                    Working on it{x.steps.length ? ` · read ${x.steps.length} table${x.steps.length === 1 ? '' : 's'} so far` : ''}… this can take up to a minute.
                  </p>
                )}
                {x.state !== 'thinking' && <Answer text={x.answer} error={x.state === 'error'} />}
                {x.steps.length > 0 && x.state !== 'thinking' && (
                  <details className="text-200 text-muted-foreground">
                    <summary className="cursor-pointer">How I got this ({x.steps.length} lookup{x.steps.length === 1 ? '' : 's'})</summary>
                    <ul className="mt-100 list-disc pl-500">{x.steps.map((s, j) => <li key={j}>{s}</li>)}</ul>
                  </details>
                )}
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex gap-200 border-t border-border p-400">
            <label className="sr-only" htmlFor="ask-input">Your question</label>
            <textarea id="ask-input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(question); } }}
              placeholder="Ask a question…" disabled={busy}
              className="min-w-0 flex-1 resize-none rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            <button type="submit" disabled={busy || !question.trim()} aria-label="Send"
              className="self-end rounded-md bg-primary p-300 text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <Send className="icon-size-200" />
            </button>
          </form>
          <p className="px-400 pb-300 text-100 text-muted-foreground">Test data. Answers are generated by AI from read-only queries; check important figures on the dashboard.</p>
        </aside>
      )}
    </>
  );
}

/** Renders the model's plain-text answer: paragraphs, "- " bullets, and a muted "Source:" line. */
function Answer({ text, error }: { text: string; error: boolean }) {
  const blocks: { kind: 'p' | 'ul' | 'src'; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-*•]\s+/.test(line)) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.lines.push(line.replace(/^[-*•]\s+/, ''));
      else blocks.push({ kind: 'ul', lines: [line.replace(/^[-*•]\s+/, '')] });
    } else if (/^source:/i.test(line)) {
      blocks.push({ kind: 'src', lines: [line] });
    } else {
      blocks.push({ kind: 'p', lines: [line.replace(/\*\*/g, '')] });
    }
  }
  return (
    <div className={cn('flex flex-col gap-200 text-300', error && 'text-destructive')} role={error ? 'alert' : undefined}>
      {blocks.map((b, i) => b.kind === 'ul'
        ? <ul key={i} className="list-disc space-y-100 pl-500">{b.lines.map((l, j) => <li key={j}>{l.replace(/\*\*/g, '')}</li>)}</ul>
        : b.kind === 'src'
          ? <p key={i} className="text-200 text-muted-foreground">{b.lines[0]}</p>
          : <p key={i}>{b.lines[0]}</p>)}
    </div>
  );
}
