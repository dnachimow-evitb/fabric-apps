import { entity, date, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_timeline) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerTimeline extends Source({ schema: 'dbo', table: 'gold_customer_timeline', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @date({ optional: true, column: 'event_at' }) eventAt?: Date;
  @text({ optional: true, max: 8000 }) source?: string;
  @text({ optional: true, max: 8000 }) title?: string;
  @text({ optional: true, max: 8000 }) detail?: string;
}
