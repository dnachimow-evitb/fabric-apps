import { entity, boolean, date, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

// Generated from metadata.json (dbo.gold_dim_customer) by scripts/generate-connector-entities.mjs.
@entity()
export class GoldDimCustomer extends Source({ schema: 'dbo', table: 'gold_dim_customer', primaryKey: [] }) {
  @text({ optional: true, column: 'unified_customer_id', max: 8000 }) unifiedCustomerId?: string;
  @text({ optional: true, column: 'customer_type', max: 8000 }) customerType?: string;
  @text({ optional: true, column: 'customer_name', max: 8000 }) customerName?: string;
  @text({ optional: true, column: 'primary_email', max: 8000 }) primaryEmail?: string;
  @text({ optional: true, max: 8000 }) city?: string;
  @text({ optional: true, max: 8000 }) state?: string;
  @text({ optional: true, max: 8000 }) region?: string;
  @text({ optional: true, column: 'account_manager', max: 8000 }) accountManager?: string;
  @int({ optional: true, column: 'location_count' }) locationCount?: number;
  @text({ optional: true, column: 'payment_terms', max: 8000 }) paymentTerms?: string;
  @boolean({ optional: true, column: 'is_pro_member' }) isProMember?: boolean;
  @date({ optional: true, column: 'customer_since' }) customerSince?: Date;
  @boolean({ optional: true, column: 'in_erp' }) inErp?: boolean;
  @boolean({ optional: true, column: 'in_shopify' }) inShopify?: boolean;
  @boolean({ optional: true, column: 'in_klaviyo' }) inKlaviyo?: boolean;
  @boolean({ optional: true, column: 'in_zendesk' }) inZendesk?: boolean;
  @int({ optional: true, column: 'source_system_count' }) sourceSystemCount?: number;
  @text({ optional: true, column: 'erp_customer_number', max: 8000 }) erpCustomerNumber?: string;
  @text({ optional: true, column: 'shopify_customer_id', max: 8000 }) shopifyCustomerId?: string;
  @text({ optional: true, column: 'zendesk_organization_id', max: 8000 }) zendeskOrganizationId?: string;
  @int({ optional: true, column: 'klaviyo_profile_count' }) klaviyoProfileCount?: number;
  @int({ optional: true, column: 'zendesk_user_count' }) zendeskUserCount?: number;
  @int({ optional: true, column: 'linked_source_records' }) linkedSourceRecords?: number;
  @decimal({ optional: true, column: 'identity_confidence' }) identityConfidence?: number;
  @boolean({ optional: true, column: 'email_marketing_consent' }) emailMarketingConsent?: boolean;
  @boolean({ optional: true, column: 'sms_marketing_consent' }) smsMarketingConsent?: boolean;
  @date({ optional: true, column: 'first_order_date' }) firstOrderDate?: Date;
  @date({ optional: true, column: 'last_order_date' }) lastOrderDate?: Date;
  @int({ optional: true, column: 'lifetime_orders' }) lifetimeOrders?: number;
  @int({ optional: true, column: 'orders_12m' }) orders12m?: number;
  @date({ optional: true, column: 'last_email_engagement_at' }) lastEmailEngagementAt?: Date;
  @date({ optional: true, column: 'last_sms_click_at' }) lastSmsClickAt?: Date;
  @date({ optional: true, column: 'last_web_activity_at' }) lastWebActivityAt?: Date;
  @date({ optional: true, column: 'last_support_contact_at' }) lastSupportContactAt?: Date;
  @int({ optional: true, column: 'tickets_12m' }) tickets12m?: number;
  @int({ optional: true, column: 'open_tickets' }) openTickets?: number;
  @text({ optional: true, column: 'active_channels_12m', max: 8000 }) activeChannels12m?: string;
  @int({ optional: true, column: 'active_channel_count_12m' }) activeChannelCount12m?: number;
  @text({ optional: true, column: 'lifecycle_stage', max: 8000 }) lifecycleStage?: string;
  @date({ optional: true, column: 'as_of_date' }) asOfDate?: Date;
}
