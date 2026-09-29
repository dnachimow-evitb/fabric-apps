import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_risk_concentration) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldRiskConcentration extends Source({ schema: 'dbo', table: 'gold_risk_concentration', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) dimension?: string;
  @text({ optional: true, max: 8000 }) value?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @int({ optional: true }) customers?: number;
  @int({ optional: true, column: 'high_risk_customers' }) highRiskCustomers?: number;
  @decimal({ optional: true, column: 'net_sales_ttm', precision: 14, scale: 2 }) netSalesTtm?: number;
  @decimal({ optional: true, column: 'revenue_at_risk', precision: 14, scale: 2 }) revenueAtRisk?: number;
  @decimal({ optional: true, column: 'share_of_risk' }) shareOfRisk?: number;
}
