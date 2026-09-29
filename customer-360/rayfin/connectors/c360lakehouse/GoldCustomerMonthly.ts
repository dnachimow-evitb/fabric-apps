import { entity, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_monthly) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerMonthly extends Source({ schema: 'dbo', table: 'gold_customer_monthly', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, max: 8000 }) region?: string;
  @text({ optional: true, column: 'account_manager', max: 8000 }) accountManager?: string;
  @date({ optional: true }) month?: Date;
  @decimal({ optional: true, column: 'net_sales', precision: 14, scale: 2 }) netSales?: number;
  @int({ optional: true }) orders?: number;
  @decimal({ optional: true, column: 'returns_amount', precision: 14, scale: 2 }) returnsAmount?: number;
  @int({ optional: true, column: 'returns_count' }) returnsCount?: number;
  @int({ optional: true, column: 'marketing_touches' }) marketingTouches?: number;
  @int({ optional: true, column: 'marketing_engagements' }) marketingEngagements?: number;
  @int({ optional: true }) tickets?: number;
}
