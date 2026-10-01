# Plan: transaction-level detail in the app

Status: **parked** (branch `feature/transaction-detail`, planned 2026-09-30). Nothing is built yet.

## Problem
The lakehouse holds transaction-level data in silver, but the app only reads `gold_*` tables, which are summaries.
So the app has no order drill-down, no monthly figures by product line (the Reports page can't follow the date
range), and no breakdowns by return reason, ticket priority/satisfaction over time, or campaign/channel.

## Current grain (as of v1.1)
| Source | Silver (one row per…) | What the app sees (gold) |
|---|---|---|
| Orders | `silver_orders` (13,708 orders), `silver_order_lines` (37,813 lines, with SKU + product line) | customer × month totals; customer × SKU and customer × product line as trailing-12-month totals; latest 25 timeline events |
| Returns | `silver_returns` (3,258, every one tied to an order + line number) | rolled into the same totals; return rate per customer / SKU |
| Zendesk | `silver_zendesk_tickets` (3,161 tickets; 1,651 carry an order number) | ticket counts per customer × month; priority, CSAT and resolution only as per-customer snapshots |
| Klaviyo | `silver_klaviyo_events` (436,947 events; campaigns and flows) | campaign touches/engagements per customer × month (flows excluded, opens and clicks pooled); product views as a 90-day total |

Silver rows carry source-system customer IDs; they need `silver_customer_identity_map` to reach `unified_customer_id`.

## Proposed gold tables
| Table | One row per | Key columns | Enables |
|---|---|---|---|
| `gold_order_lines` | order line, with its returns | unified customer, order date + month, channel, sales rep, ship state, SKU, product line, category, qty, net amount, discount; returned qty, refund, return reason, item condition, return date | sales / returns by month × product line × SKU × customer; date range on Reports; monthly trend per line; order list on Customer 360 |
| `gold_tickets` | ticket | unified customer, created / solved dates + month, status, priority, type, channel, CSAT, first reply and resolution minutes, reopens, order number | support trends by month; product-line view for the ~52% of tickets linked to an order (label the coverage) |
| `gold_marketing_activity` | customer × month × campaign or flow × event type | unified customer, month, campaign / flow name, channel (email / SMS), event type, count, product line (for views) | campaign and flow performance, email vs SMS, opens vs clicks, product views by month |

Klaviyo is aggregated rather than per event: ~437k rows is too many to total in the browser.

## Decisions to settle when resumed
- Returns: filter by **sale date** (return rate of what was sold) by default; keep the return date too for refunds-paid views.
- Ticket → product line coverage is partial; show it as a labelled subset, not a total.
- Whether to also carry Klaviyo flows into silver (currently bronze only).

## Steps
1. Add the three tables to the pipeline notebooks (`c360_customer_metrics` or a new notebook), keeping decimal precision ≤ 28.
2. Rebuild, refresh SQL endpoint metadata, re-add the connector and regenerate entities (`CLAUDE.md` → "After schema changes").
3. App: queries in `lib/c360.ts`, then use them (Reports date range + monthly trend first), and update `lib/visual-lineage.ts`.
4. Gates, deploy to Dev and check, PR, merge, tag.
