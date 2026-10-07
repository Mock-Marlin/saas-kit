/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import {
  parseBillingSnapshot,
  parseCheckoutResult,
  type BillingSnapshot,
  type CheckoutResult,
} from "@mockmarlin/saas-contract";

import { readJson, type SaasClient } from "./client.js";

export async function reconcileCheckout(
  load: () => Promise<BillingSnapshot>,
  attempts = 8,
  delayMs = 3000,
  sleep: (ms: number) => Promise<void> = delay,
): Promise<BillingSnapshot> {
  let latest: BillingSnapshot | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await load();
    if (latest.checkoutState !== "processing") {
      return latest;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  if (latest === null) {
    throw new Error("Checkout did not return a snapshot");
  }
  return latest;
}

export function canUse(snapshot: BillingSnapshot, feature: string): boolean {
  return snapshot.entitlements[feature] === true;
}

export async function loadBilling(client: SaasClient, path: string): Promise<BillingSnapshot> {
  return readJson(await client.fetch(path), parseBillingSnapshot);
}

export async function syncBilling(client: SaasClient, path: string): Promise<BillingSnapshot> {
  return readJson(await client.fetch(path, { method: "POST" }), parseBillingSnapshot);
}

export async function postCheckout(
  client: SaasClient,
  path: string,
  planId: string,
  currency: string | undefined,
  allowRedirect: ((url: string) => boolean) | undefined,
): Promise<CheckoutResult> {
  const body = JSON.stringify(currency === undefined ? { planId } : { planId, currency });
  const result = await readJson(
    await client.fetch(path, { method: "POST", body, idempotencyKey: `checkout_${planId}` }),
    parseCheckoutResult,
  );
  if (result.status === "redirect" && allowRedirect !== undefined && !allowRedirect(result.url)) {
    throw new Error("Checkout redirect was rejected");
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
