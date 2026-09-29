// #region rayfin:app-owned — copied verbatim by the Rayfin CLI; edit freely.
//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';
// #endregion rayfin:app-owned

// App-owned: wiring for the c360lakehouse connector (Lakehouse SQL endpoint, read-only).
import {
  connectorConfig as c360lakehouseConfig,
  type C360lakehouseSchema,
} from '../../../../rayfin/connectors/c360lakehouse/schema';

export type AppConnectorsSchema = { c360lakehouse: C360lakehouseSchema };

export const connectorConfigs: Record<string, ConnectorConfig> = {
  c360lakehouse: c360lakehouseConfig,
};

// Category A connectors need no runtime entry.
export const connectorRuntimes: ConnectorsRuntime = {};
