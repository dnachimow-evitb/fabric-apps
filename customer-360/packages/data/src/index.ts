//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { MergeProposal } from './MergeProposal.js';
import type { UniversalAppSchema } from '@rayfin-app/shared';

/**
 * The app's Rayfin data schema (app-owned records). Keep in step with `UniversalAppSchema` in
 * `@rayfin-app/shared`. Read-only lakehouse data comes through the c360lakehouse connector instead.
 */
export type { UniversalAppSchema };
export { MergeProposal };

export const schema = [MergeProposal];
