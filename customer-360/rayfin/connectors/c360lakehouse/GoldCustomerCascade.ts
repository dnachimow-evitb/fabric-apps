import { entity, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_cascade) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerCascade extends Source({ schema: 'dbo', table: 'gold_customer_cascade', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, column: 'customer_name', max: 8000 }) customerName?: string;
  @text({ optional: true, max: 8000 }) region?: string;
  @text({ optional: true, column: 'account_manager', max: 8000 }) accountManager?: string;
  @date({ optional: true, column: 'spike_month' }) spikeMonth?: Date;
  @int({ optional: true, column: 'tickets_in_spike_month' }) ticketsInSpikeMonth?: number;
  @decimal({ optional: true, column: 'engagement_before' }) engagementBefore?: number;
  @decimal({ optional: true, column: 'engagement_after' }) engagementAfter?: number;
  @decimal({ optional: true, column: 'monthly_sales_before', precision: 14, scale: 2 }) monthlySalesBefore?: number;
  @decimal({ optional: true, column: 'monthly_sales_after', precision: 14, scale: 2 }) monthlySalesAfter?: number;
  @int({ optional: true, column: 'engagement_drop_lag' }) engagementDropLag?: number;
  @int({ optional: true, column: 'sales_drop_lag' }) salesDropLag?: number;
  @text({ optional: true, max: 8000 }) pattern?: string;
}
