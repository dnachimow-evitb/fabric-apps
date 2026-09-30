import { date, decimal, entity, role, text, uuid } from '@microsoft/rayfin-core';

import { DATA_STEWARDS } from './stewards.js';

/**
 * A proposal to merge two unified customers that the automatic identity rules could not link.
 *
 * Workflow (enforced server-side, not just in the UI):
 * - Any signed-in user can read proposals and create one. On create they may only set the proposal fields
 *   (never status or review fields, so a new proposal is always pending), and `proposedBy` must be their own email.
 * - Only a data steward (see stewards.ts) can update a proposal, and only its status and review fields.
 * - Nobody can delete: rejected proposals stay as the audit trail.
 *
 * The Fabric `c360_customer_dimension` notebook reads approved proposals (status = 'Approved') through a
 * OneLake shortcut and moves the secondary customer's source records onto the primary on its next run.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.email.eq(item.proposedBy),
  include: ['id', 'candidateId', 'primaryCustomerId', 'secondaryCustomerId', 'primaryName', 'secondaryName',
    'matchScore', 'note', 'proposedBy', 'proposedAt'],
})
@role('authenticated', 'update', {
  policy: (claims) => DATA_STEWARDS.slice(1).reduce((expr, email) => expr.or(claims.email.eq(email)), claims.email.eq(DATA_STEWARDS[0])),
  include: ['status', 'reviewedBy', 'reviewedAt', 'reviewNote'],
})
export class MergeProposal {
  @uuid() id!: string;
  @text({ optional: true, max: 40 }) candidateId?: string;
  @text({ min: 1, max: 40 }) primaryCustomerId!: string;
  @text({ min: 1, max: 40 }) secondaryCustomerId!: string;
  @text({ optional: true, max: 200 }) primaryName?: string;
  @text({ optional: true, max: 200 }) secondaryName?: string;
  @decimal({ optional: true, precision: 5, scale: 3 }) matchScore?: number;
  @text({ optional: true, max: 1000 }) note?: string;
  @text({ min: 3, max: 200 }) proposedBy!: string;
  @date() proposedAt!: Date;
  /** Empty while pending; 'Approved' or 'Rejected' once a steward reviews it. Creators cannot set it. */
  @text({ optional: true, max: 20 }) status?: string;
  @text({ optional: true, max: 200 }) reviewedBy?: string;
  @date({ optional: true }) reviewedAt?: Date;
  @text({ optional: true, max: 1000 }) reviewNote?: string;
}
