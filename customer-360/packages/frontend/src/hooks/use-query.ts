import { useEffect, useState } from 'react';

export type QueryState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'error'; error: Error; data?: T }
  | { status: 'success'; data: T };

interface Settled<T> { key: string; data?: T; error?: Error }

/**
 * Runs an async read whenever `key` changes. Loading is derived (the settled key differs from the
 * requested one), so previous data stays visible (dimmed) while refetching, and failures surface
 * as errors instead of leaving a spinner.
 */
export function useQuery<T>(key: string | null, run: () => Promise<T>): QueryState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    run().then(
      (data) => { if (!cancelled) setSettled({ key, data }); },
      (error: unknown) => {
        if (!cancelled) {
          setSettled((s) => ({ key, data: s?.data, error: error instanceof Error ? error : new Error(String(error)) }));
        }
      },
    );
    return () => { cancelled = true; };
    // `run` is recreated each render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!settled || settled.key !== key) return { status: 'loading', data: settled?.data };
  if (settled.error) return { status: 'error', error: settled.error, data: settled.data };
  return { status: 'success', data: settled.data as T };
}
