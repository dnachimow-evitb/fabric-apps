import { entity, boolean, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_customer_metrics) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldCustomerMetrics extends Source({ schema: 'dbo', table: 'gold_customer_metrics', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, column: 'customer_name', max: 8000 }) customerName?: string;
  @text({ optional: true, max: 8000 }) region?: string;
  @text({ optional: true, column: 'account_manager', max: 8000 }) accountManager?: string;
  @boolean({ optional: true, column: 'is_pro_member' }) isProMember?: boolean;
  @decimal({ optional: true, column: 'net_sales_ttm', precision: 14, scale: 2 }) netSalesTtm?: number;
  @decimal({ optional: true, column: 'net_sales_prior_ttm', precision: 14, scale: 2 }) netSalesPriorTtm?: number;
  @decimal({ optional: true, column: 'sales_yoy' }) salesYoy?: number;
  @int({ optional: true, column: 'orders_ttm' }) ordersTtm?: number;
  @date({ optional: true, column: 'last_order_date' }) lastOrderDate?: Date;
  @int({ optional: true, column: 'days_since_order' }) daysSinceOrder?: number;
  @decimal({ optional: true, column: 'returns_ttm', precision: 14, scale: 2 }) returnsTtm?: number;
  @decimal({ optional: true, column: 'return_rate_ttm' }) returnRateTtm?: number;
  @int({ optional: true, column: 'defect_returns_ttm' }) defectReturnsTtm?: number;
  @int({ optional: true, column: 'product_lines_ttm' }) productLinesTtm?: number;
  @int({ optional: true, column: 'tickets_12m' }) tickets12m?: number;
  @int({ optional: true, column: 'tickets_90d' }) tickets90d?: number;
  @int({ optional: true, column: 'open_tickets' }) openTickets?: number;
  @int({ optional: true, column: 'high_priority_open' }) highPriorityOpen?: number;
  @int({ optional: true, column: 'bad_csat_12m' }) badCsat12m?: number;
  @int({ optional: true, column: 'avg_resolution_minutes_12m' }) avgResolutionMinutes12m?: number;
  @int({ optional: true, column: 'touches_90d' }) touches90d?: number;
  @int({ optional: true, column: 'engagements_90d' }) engagements90d?: number;
  @decimal({ optional: true, column: 'engagement_rate_90d' }) engagementRate90d?: number;
  @decimal({ optional: true, column: 'engagement_rate_prior' }) engagementRatePrior?: number;
  @int({ optional: true, column: 'days_since_engaged' }) daysSinceEngaged?: number;
  @int({ optional: true, column: 'churn_risk_score' }) churnRiskScore?: number;
  @text({ optional: true, column: 'churn_risk_band', max: 8000 }) churnRiskBand?: string;
  @text({ optional: true, column: 'top_churn_driver', max: 8000 }) topChurnDriver?: string;
  @text({ optional: true, column: 'churn_drivers', max: 8000 }) churnDrivers?: string;
  @int({ optional: true, column: 'upsell_score' }) upsellScore?: number;
  @decimal({ optional: true, column: 'upsell_value_est', precision: 14, scale: 2 }) upsellValueEst?: number;
  @text({ optional: true, column: 'top_upsell_product_line', max: 8000 }) topUpsellProductLine?: string;
  @decimal({ optional: true, column: 'revenue_at_risk', precision: 14, scale: 2 }) revenueAtRisk?: number;
  @decimal({ optional: true, column: 'priority_score', precision: 14, scale: 2 }) priorityScore?: number;
  @text({ optional: true, column: 'next_best_action', max: 8000 }) nextBestAction?: string;
  @date({ optional: true, column: 'as_of_date' }) asOfDate?: Date;
}
