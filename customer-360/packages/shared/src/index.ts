/**
 * Browser-safe contracts shared by the data registration package and frontend.
 *
 * Keep each record shape aligned with its decorated runtime entity in
 * `@rayfin-app/data`. This package must stay isomorphic, so do not import the
 * decorated classes here.
 */
export interface MergeProposalRecord {
  id: string;
  candidateId?: string;
  primaryCustomerId: string;
  secondaryCustomerId: string;
  primaryName?: string;
  secondaryName?: string;
  matchScore?: number;
  note?: string;
  proposedBy: string;
  proposedAt: Date;
  /** Empty while pending; 'Approved' or 'Rejected' after steward review. */
  status?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
}

export type UniversalAppSchema = {
  MergeProposal: MergeProposalRecord;
};

/** Mirrors DATA_STEWARDS in @rayfin-app/data (server-enforced there); used only to show or hide review controls. */
export const DATA_STEWARD_EMAILS: readonly string[] = ['dnachimow@dsdemo.net'];
