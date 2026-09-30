// Executes the in-app Q&A's `query_gold_table` tool calls in the browser, through the same read-only
// c360lakehouse connector the dashboard uses. Every call is validated against QA_CATALOG first, so the
// model can only read gold-table columns the app already exposes.
import { QA_CATALOG, type QaTable } from '@rayfin-app/shared';

import { getRayfinClient } from './rayfin-client';

export interface QueryInput {
  table: string;
  columns: string[];
  filters: { column: string; op: string; value: string }[];
  group_by: string[];
  aggregates: { alias: string; op: string; column: string }[];
  order_by: { column: string; direction: string }[];
  limit: number;
}

export interface QueryResult {
  ok: boolean;
  /** JSON text handed back to the model as the tool result. */
  content: string;
  /** Short description for the "how I got this" trail in the UI. */
  summary: string;
}

/** The connector's fluent query surface, reached by entity name (validated against the catalog). */
interface Builder {
  select(columns: string[]): Builder;
  where(filter: Record<string, Record<string, unknown>>): Builder;
  orderBy(order: Record<string, 'asc' | 'desc'>): Builder;
  first(n: number): Builder;
  groupBy(columns: string[]): Builder;
  aggregate(spec: Record<string, Record<string, string>>): Builder;
  execute(): Promise<unknown[]>;
}

const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith']);
const AGG_OPS = new Set(['sum', 'avg', 'min', 'max', 'count']);
const MAX_RESULT_CHARS = 40_000;

function coerce(table: QaTable, column: string, value: string): unknown {
  const type = table.columns.find((c) => c.name === column)?.type;
  if (type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`"${value}" is not a number for ${column}`);
    return n;
  }
  if (type === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

export async function runQuery(input: QueryInput): Promise<QueryResult> {
  const table = QA_CATALOG.find((t) => t.entity === input.table);
  if (!table) return { ok: false, content: `Unknown table ${input.table}.`, summary: `Unknown table ${input.table}` };
  const known = new Set(table.columns.map((c) => c.name));
  const bad = [...input.columns, ...input.group_by, ...input.filters.map((f) => f.column), ...input.order_by.map((o) => o.column),
    ...input.aggregates.filter((a) => a.op !== 'count').map((a) => a.column)].filter((c) => !known.has(c));
  if (bad.length) {
    return { ok: false, content: `Unknown column(s) on ${table.entity}: ${[...new Set(bad)].join(', ')}.`, summary: `Rejected: unknown columns` };
  }
  const limit = Math.min(200, Math.max(1, Math.floor(input.limit || 50)));

  try {
    const where: Record<string, Record<string, unknown>> = {};
    for (const f of input.filters) {
      if (!FILTER_OPS.has(f.op)) throw new Error(`Unsupported filter operator ${f.op}`);
      where[f.column] = { ...(where[f.column] ?? {}), [f.op]: coerce(table, f.column, f.value) };
    }
    const client = await getRayfinClient();
    // Entity names were checked against the catalog above, which is generated from these connector entities.
    const entity = (client.connectors.c360lakehouse as unknown as Record<string, Builder>)[table.entity];
    let rows: Record<string, unknown>[];

    if (input.aggregates.length) {
      const spec: Record<string, Record<string, string>> = {};
      for (const a of input.aggregates) {
        if (!AGG_OPS.has(a.op)) throw new Error(`Unsupported aggregate ${a.op}`);
        const column = a.op === 'count' && !known.has(a.column) ? table.columns[0].name : a.column;
        spec[a.alias.replace(/[^A-Za-z0-9_]/g, '_') || `${a.op}_${column}`] = { [a.op]: column };
      }
      let q = Object.keys(where).length ? entity.where(where) : entity;
      if (input.group_by.length) q = q.groupBy(input.group_by);
      const raw = (await q.aggregate(spec).execute()) as { fields?: Record<string, unknown>; aggregations?: Record<string, unknown> }[];
      rows = raw.map((r) => ({ ...(r.fields ?? {}), ...(r.aggregations ?? {}) }));
      for (const o of [...input.order_by].reverse()) {
        const k = o.column in (rows[0] ?? {}) ? o.column : input.aggregates.find((a) => a.column === o.column)?.alias ?? o.column;
        rows.sort((a, b) => {
          const x = a[k] as number | string, y = b[k] as number | string;
          const c = x < y ? -1 : x > y ? 1 : 0;
          return o.direction === 'desc' ? -c : c;
        });
      }
      rows = rows.slice(0, limit);
    } else {
      const columns = input.columns.length ? input.columns : table.columns.slice(0, 12).map((c) => c.name);
      let q = entity.select(columns);
      if (Object.keys(where).length) q = q.where(where);
      if (input.order_by.length) {
        q = q.orderBy(Object.fromEntries(input.order_by.map((o) => [o.column, o.direction === 'desc' ? 'desc' : 'asc'])));
      }
      rows = (await q.first(limit).execute()) as Record<string, unknown>[];
    }

    const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])));
    let content = JSON.stringify({ table: table.entity, rowCount: clean.length, rows: clean });
    if (content.length > MAX_RESULT_CHARS) content = `${content.slice(0, MAX_RESULT_CHARS)}… (truncated; narrow the query)`;
    return { ok: true, content, summary: `${table.entity}: ${clean.length} row${clean.length === 1 ? '' : 's'}${input.aggregates.length ? ' (aggregated)' : ''}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, content: `Query failed: ${msg.slice(0, 300)}`, summary: `${table.entity}: query failed` };
  }
}
