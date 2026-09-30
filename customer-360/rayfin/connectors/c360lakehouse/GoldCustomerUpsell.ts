import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_upsell) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerUpsell extends Source({ schema: 'dbo', table: 'gold_customer_upsell', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @int({ optional: true }) rank?: number;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @decimal({ optional: true, column: 'estimated_annual_value', precision: 14, scale: 2 }) estimatedAnnualValue?: number;
  @decimal({ optional: true, column: 'peer_penetration' }) peerPenetration?: number;
  @int({ optional: true, column: 'views_90d' }) views90d?: number;
  @text({ optional: true, max: 8000 }) reason?: string;
}
