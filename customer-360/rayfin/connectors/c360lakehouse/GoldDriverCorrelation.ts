import { entity, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_driver_correlation) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldDriverCorrelation extends Source({ schema: 'dbo', table: 'gold_driver_correlation', primaryKey: [] }) {
  @text({ optional: true, column: 'driver_key', max: 8000 }) driverKey?: string;
  @text({ optional: true, max: 8000 }) driver?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @decimal({ optional: true }) correlation?: number;
  @int({ optional: true }) n?: number;
  @decimal({ optional: true, column: 'sales_change_when_high' }) salesChangeWhenHigh?: number;
  @decimal({ optional: true, column: 'sales_change_otherwise' }) salesChangeOtherwise?: number;
  @text({ optional: true, column: 'high_definition', max: 8000 }) highDefinition?: string;
}
