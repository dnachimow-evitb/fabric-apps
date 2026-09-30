import { entity, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_sku) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerSku extends Source({ schema: 'dbo', table: 'gold_customer_sku', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, column: 'customer_name', max: 8000 }) customerName?: string;
  @text({ optional: true, max: 8000 }) region?: string;
  @text({ optional: true, column: 'account_manager', max: 8000 }) accountManager?: string;
  @text({ optional: true, max: 8000 }) sku?: string;
  @text({ optional: true, column: 'product_name', max: 8000 }) productName?: string;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @decimal({ optional: true, column: 'net_sales_ttm', precision: 14, scale: 2 }) netSalesTtm?: number;
  @decimal({ optional: true, column: 'net_sales_prior_ttm', precision: 14, scale: 2 }) netSalesPriorTtm?: number;
  @decimal({ optional: true, column: 'returns_ttm', precision: 14, scale: 2 }) returnsTtm?: number;
  @int({ optional: true, column: 'units_ttm' }) unitsTtm?: number;
  @date({ optional: true, column: 'last_purchased' }) lastPurchased?: Date;
}
