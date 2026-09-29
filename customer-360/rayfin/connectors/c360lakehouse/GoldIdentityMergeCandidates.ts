import { entity, boolean, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_identity_merge_candidates) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldIdentityMergeCandidates extends Source({ schema: 'dbo', table: 'gold_identity_merge_candidates', primaryKey: [] }) {
  @text({ optional: true, column: 'candidate_id', max: 8000 }) candidateId?: string;
  @text({ optional: true, column: 'primary_customer_id', max: 8000 }) primaryCustomerId?: string;
  @text({ optional: true, column: 'secondary_customer_id', max: 8000 }) secondaryCustomerId?: string;
  @text({ optional: true, column: 'primary_customer_type', max: 8000 }) primaryCustomerType?: string;
  @text({ optional: true, column: 'secondary_customer_type', max: 8000 }) secondaryCustomerType?: string;
  @text({ optional: true, column: 'primary_customer_name', max: 8000 }) primaryCustomerName?: string;
  @text({ optional: true, column: 'secondary_customer_name', max: 8000 }) secondaryCustomerName?: string;
  @text({ optional: true, column: 'primary_primary_email', max: 8000 }) primaryPrimaryEmail?: string;
  @text({ optional: true, column: 'secondary_primary_email', max: 8000 }) secondaryPrimaryEmail?: string;
  @text({ optional: true, column: 'primary_city', max: 8000 }) primaryCity?: string;
  @text({ optional: true, column: 'secondary_city', max: 8000 }) secondaryCity?: string;
  @text({ optional: true, column: 'primary_state', max: 8000 }) primaryState?: string;
  @text({ optional: true, column: 'secondary_state', max: 8000 }) secondaryState?: string;
  @int({ optional: true, column: 'primary_lifetime_orders' }) primaryLifetimeOrders?: number;
  @int({ optional: true, column: 'secondary_lifetime_orders' }) secondaryLifetimeOrders?: number;
  @int({ optional: true, column: 'primary_source_system_count' }) primarySourceSystemCount?: number;
  @int({ optional: true, column: 'secondary_source_system_count' }) secondarySourceSystemCount?: number;
  @decimal({ optional: true }) score?: number;
  @decimal({ optional: true, column: 'handle_similarity' }) handleSimilarity?: number;
  @boolean({ optional: true, column: 'same_city' }) sameCity?: boolean;
  @boolean({ optional: true, column: 'same_name' }) sameName?: boolean;
  @int({ optional: true, column: 'order_refs' }) orderRefs?: number;
  @text({ optional: true, max: 8000 }) reasons?: string;
}
