import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_sku_recs) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerSkuRecs extends Source({ schema: 'dbo', table: 'gold_customer_sku_recs', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @int({ optional: true }) rank?: number;
  @text({ optional: true, max: 8000 }) sku?: string;
  @text({ optional: true, column: 'product_name', max: 8000 }) productName?: string;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @decimal({ optional: true }) score?: number;
  @decimal({ optional: true, column: 'estimated_annual_value', precision: 14, scale: 2 }) estimatedAnnualValue?: number;
  @text({ optional: true, column: 'because_sku', max: 8000 }) becauseSku?: string;
  @text({ optional: true, max: 8000 }) reason?: string;
}
