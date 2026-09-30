import { Workflow } from 'lucide-react';

import { useShowLineage } from '@/lib/lineage-context';
import { VISUAL_BY_ID, type VisualId } from '@/lib/visual-lineage';

/** Small "Lineage" button on a visual: jumps to how it is built (tables, dimensions, measures, query). */
export function LineageLink({ id, compact }: { id: VisualId; compact?: boolean }) {
  const show = useShowLineage();
  if (!show) return null;
  const title = VISUAL_BY_ID.get(id)?.title ?? id;
  return (
    <button type="button" onClick={() => show(id)} aria-label={`How "${title}" is built`} title="Show data lineage"
      className="inline-flex shrink-0 items-center gap-100 rounded-md px-100 py-100 font-heading text-100 font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Workflow aria-hidden className="icon-size-100" />{!compact && 'Lineage'}
    </button>
  );
}
