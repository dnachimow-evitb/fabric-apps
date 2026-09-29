import { entity, boolean, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_product_line) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerProductLine extends Source({ schema: 'dbo', table: 'gold_customer_product_line', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'product_line', max: 8000 }) productLine?: string;
  @decimal({ optional: true, column: 'net_sales_ttm', precision: 14, scale: 2 }) netSalesTtm?: number;
  @decimal({ optional: true, column: 'share_of_sales_ttm', precision: 9, scale: 4 }) shareOfSalesTtm?: number;
  @boolean({ optional: true, column: 'purchased_ttm' }) purchasedTtm?: boolean;
  @date({ optional: true, column: 'last_purchased' }) lastPurchased?: Date;
  @int({ optional: true, column: 'views_90d' }) views90d?: number;
  @decimal({ optional: true, column: 'peer_penetration' }) peerPenetration?: number;
}
