import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_sku_performance) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldSkuPerformance extends Source({ schema: 'dbo', table: 'gold_sku_performance', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) sku?: string;
  @text({ optional: true, column: 'product_name', max: 8000 }) productName?: string;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @text({ optional: true, max: 8000 }) category?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @decimal({ optional: true, column: 'net_sales_ttm', precision: 14, scale: 2 }) netSalesTtm?: number;
  @decimal({ optional: true, column: 'net_sales_prior_ttm', precision: 14, scale: 2 }) netSalesPriorTtm?: number;
  @decimal({ optional: true, column: 'returns_ttm', precision: 14, scale: 2 }) returnsTtm?: number;
  @decimal({ optional: true, column: 'defect_returns_ttm', precision: 14, scale: 2 }) defectReturnsTtm?: number;
  @int({ optional: true, column: 'units_ttm' }) unitsTtm?: number;
  @int({ optional: true, column: 'buyers_ttm' }) buyersTtm?: number;
  @int({ optional: true, column: 'tickets_linked_ttm' }) ticketsLinkedTtm?: number;
  @decimal({ optional: true, column: 'return_rate_ttm' }) returnRateTtm?: number;
  @decimal({ optional: true, column: 'sales_yoy' }) salesYoy?: number;
  @decimal({ optional: true, column: 'repeat_buyer_rate' }) repeatBuyerRate?: number;
}
