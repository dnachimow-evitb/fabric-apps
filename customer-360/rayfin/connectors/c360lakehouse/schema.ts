import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { GoldCustomerMetrics } from './GoldCustomerMetrics.js';
import { GoldCustomerMonthly } from './GoldCustomerMonthly.js';
import { GoldCustomerProductLine } from './GoldCustomerProductLine.js';
import { GoldCustomerTimeline } from './GoldCustomerTimeline.js';
import { GoldCustomerUpsell } from './GoldCustomerUpsell.js';
import { GoldDimCustomer } from './GoldDimCustomer.js';
import { GoldProductLinePenetration } from './GoldProductLinePenetration.js';

export { GoldCustomerMetrics } from './GoldCustomerMetrics.js';
export { GoldCustomerMonthly } from './GoldCustomerMonthly.js';
export { GoldCustomerProductLine } from './GoldCustomerProductLine.js';
export { GoldCustomerTimeline } from './GoldCustomerTimeline.js';
export { GoldCustomerUpsell } from './GoldCustomerUpsell.js';
export { GoldDimCustomer } from './GoldDimCustomer.js';
export { GoldProductLinePenetration } from './GoldProductLinePenetration.js';

export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { GoldCustomerMetrics, GoldCustomerMonthly, GoldCustomerProductLine, GoldCustomerTimeline, GoldCustomerUpsell, GoldDimCustomer, GoldProductLinePenetration },
} as const satisfies ConnectorConfig;

export type C360lakehouseSchema = GraphQLBackedConnector<
  { GoldCustomerMetrics: typeof GoldCustomerMetrics; GoldCustomerMonthly: typeof GoldCustomerMonthly; GoldCustomerProductLine: typeof GoldCustomerProductLine; GoldCustomerTimeline: typeof GoldCustomerTimeline; GoldCustomerUpsell: typeof GoldCustomerUpsell; GoldDimCustomer: typeof GoldDimCustomer; GoldProductLinePenetration: typeof GoldProductLinePenetration },
  typeof connectorConfig
>;
