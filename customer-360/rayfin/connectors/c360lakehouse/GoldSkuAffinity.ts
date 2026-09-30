import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_sku_affinity) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldSkuAffinity extends Source({ schema: 'dbo', table: 'gold_sku_affinity', primaryKey: [] }) {
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, max: 8000 }) sku?: string;
  @int({ optional: true }) rank?: number;
  @text({ optional: true, column: 'related_sku', max: 8000 }) relatedSku?: string;
  @text({ optional: true, column: 'related_product_name', max: 8000 }) relatedProductName?: string;
  @text({ optional: true, column: 'related_product_line', max: 8000 }) relatedProductLine?: string;
  @int({ optional: true, column: 'pair_customers' }) pairCustomers?: number;
  @decimal({ optional: true }) confidence?: number;
  @decimal({ optional: true }) lift?: number;
}
