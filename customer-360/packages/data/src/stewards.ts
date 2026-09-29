/**
 * Data stewards: the only people who can approve or reject identity merges.
 *
 * Enforced server-side by the MergeProposal update policy (the caller's email claim must match one of
 * these). Changing the list takes effect on the next `rayfin up`. Emails are compared exactly, so use
 * the lower-case sign-in address.
 */
export const DATA_STEWARDS = ['dnachimow@dsdemo.net'] as const;
