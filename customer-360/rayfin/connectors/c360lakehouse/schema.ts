import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { GoldCustomerCascade } from './GoldCustomerCascade.js';
import { GoldCustomerMetrics } from './GoldCustomerMetrics.js';
import { GoldCustomerMonthly } from './GoldCustomerMonthly.js';
import { GoldCustomerProductLine } from './GoldCustomerProductLine.js';
import { GoldCustomerSku } from './GoldCustomerSku.js';
import { GoldCustomerSkuRecs } from './GoldCustomerSkuRecs.js';
import { GoldCustomerTimeline } from './GoldCustomerTimeline.js';
import { GoldCustomerUpsell } from './GoldCustomerUpsell.js';
import { GoldDimCustomer } from './GoldDimCustomer.js';
import { GoldDriverCorrelation } from './GoldDriverCorrelation.js';
import { GoldIdentityMergeCandidates } from './GoldIdentityMergeCandidates.js';
import { GoldIssueCascade } from './GoldIssueCascade.js';
import { GoldProductLinePenetration } from './GoldProductLinePenetration.js';
import { GoldRiskConcentration } from './GoldRiskConcentration.js';
import { GoldSkuAffinity } from './GoldSkuAffinity.js';
import { GoldSkuPerformance } from './GoldSkuPerformance.js';

export { GoldCustomerCascade } from './GoldCustomerCascade.js';
export { GoldCustomerMetrics } from './GoldCustomerMetrics.js';
export { GoldCustomerMonthly } from './GoldCustomerMonthly.js';
export { GoldCustomerProductLine } from './GoldCustomerProductLine.js';
export { GoldCustomerSku } from './GoldCustomerSku.js';
export { GoldCustomerSkuRecs } from './GoldCustomerSkuRecs.js';
export { GoldCustomerTimeline } from './GoldCustomerTimeline.js';
export { GoldCustomerUpsell } from './GoldCustomerUpsell.js';
export { GoldDimCustomer } from './GoldDimCustomer.js';
export { GoldDriverCorrelation } from './GoldDriverCorrelation.js';
export { GoldIdentityMergeCandidates } from './GoldIdentityMergeCandidates.js';
export { GoldIssueCascade } from './GoldIssueCascade.js';
export { GoldProductLinePenetration } from './GoldProductLinePenetration.js';
export { GoldRiskConcentration } from './GoldRiskConcentration.js';
export { GoldSkuAffinity } from './GoldSkuAffinity.js';
export { GoldSkuPerformance } from './GoldSkuPerformance.js';

export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { GoldCustomerCascade, GoldCustomerMetrics, GoldCustomerMonthly, GoldCustomerProductLine, GoldCustomerSku, GoldCustomerSkuRecs, GoldCustomerTimeline, GoldCustomerUpsell, GoldDimCustomer, GoldDriverCorrelation, GoldIdentityMergeCandidates, GoldIssueCascade, GoldProductLinePenetration, GoldRiskConcentration, GoldSkuAffinity, GoldSkuPerformance },
} as const satisfies ConnectorConfig;

export type C360lakehouseSchema = GraphQLBackedConnector<
  { GoldCustomerCascade: typeof GoldCustomerCascade; GoldCustomerMetrics: typeof GoldCustomerMetrics; GoldCustomerMonthly: typeof GoldCustomerMonthly; GoldCustomerProductLine: typeof GoldCustomerProductLine; GoldCustomerSku: typeof GoldCustomerSku; GoldCustomerSkuRecs: typeof GoldCustomerSkuRecs; GoldCustomerTimeline: typeof GoldCustomerTimeline; GoldCustomerUpsell: typeof GoldCustomerUpsell; GoldDimCustomer: typeof GoldDimCustomer; GoldDriverCorrelation: typeof GoldDriverCorrelation; GoldIdentityMergeCandidates: typeof GoldIdentityMergeCandidates; GoldIssueCascade: typeof GoldIssueCascade; GoldProductLinePenetration: typeof GoldProductLinePenetration; GoldRiskConcentration: typeof GoldRiskConcentration; GoldSkuAffinity: typeof GoldSkuAffinity; GoldSkuPerformance: typeof GoldSkuPerformance },
  typeof connectorConfig
>;
