import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_product_line_penetration) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldProductLinePenetration extends Source({ schema: 'dbo', table: 'gold_product_line_penetration', primaryKey: [] }) {
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @decimal({ optional: true }) penetration?: number;
  @int({ optional: true, column: 'active_customers' }) activeCustomers?: number;
  @decimal({ optional: true, column: 'avg_spend_per_buyer', precision: 14, scale: 2 }) avgSpendPerBuyer?: number;
}
