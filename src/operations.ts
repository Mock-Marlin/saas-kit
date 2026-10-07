/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { fillPath, parseOperation, type Operation } from "@mockmarlin/saas-contract";

import { readJson, type SaasClient } from "./client.js";

export async function startOperation(client: SaasClient, path: string, name: string): Promise<Operation> {
  return readJson(
    await client.fetch(path, { method: "POST", body: JSON.stringify({ name }), idempotencyKey: `operation_${name}` }),
    parseOperation,
  );
}

export async function loadOperation(client: SaasClient, itemPath: string, id: string): Promise<Operation> {
  return readJson(await client.fetch(fillPath(itemPath, { id })), parseOperation);
}
