import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_issue_cascade) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldIssueCascade extends Source({ schema: 'dbo', table: 'gold_issue_cascade', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cohort?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @int({ optional: true, column: 'rel_month' }) relMonth?: number;
  @int({ optional: true }) customers?: number;
  @decimal({ optional: true, column: 'sales_index' }) salesIndex?: number;
  @decimal({ optional: true, column: 'engagement_rate' }) engagementRate?: number;
  @decimal({ optional: true, column: 'tickets_per_customer' }) ticketsPerCustomer?: number;
}
