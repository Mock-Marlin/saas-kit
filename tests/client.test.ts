/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";

import { parseBillingSnapshot } from "@mockmarlin/saas-contract";

import { reconcileCheckout, syncBilling } from "../src/billing.js";
import { SaasClient, SaasIdleError } from "../src/client.js";
import { createPreferenceStore } from "../src/preferences.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("SaasClient", () => {
  it("coalesces identical reads and sends a request id", async () => {
    let calls = 0;
    const client = new SaasClient({
      baseUrl: "/api/v1",
      fetch: async (_url, init) => {
        calls += 1;
        const headers = new Headers(init?.headers);
        expect(headers.get("x-request-id")).toBeTruthy();
        return jsonResponse(200, { ok: true });
      },
    });
    const [left, right] = await Promise.all([client.fetch("/billing"), client.fetch("/billing")]);
    expect(calls).toBe(1);
    expect(await left.json()).toEqual({ ok: true });
    expect(await right.json()).toEqual({ ok: true });
  });

  it("refreshes once after a 401 and retries", async () => {
    let calls = 0;
    let refreshes = 0;
    const client = new SaasClient({
      baseUrl: "/api/v1",
      refreshSession: async () => {
        refreshes += 1;
        return true;
      },
      fetch: async () => {
        calls += 1;
        return jsonResponse(calls === 1 ? 401 : 200, calls === 1
          ? { status: 401, code: "unauthorized", message: "Sign in", requestId: "r" }
          : { ok: true });
      },
    });
    const response = await client.fetch("/session");
    expect(response.status).toBe(200);
    expect(refreshes).toBe(1);
  });

  it("retries an idempotent 503 and notices a new server build", async () => {
    const builds: string[] = [];
    let calls = 0;
    const client = new SaasClient({
      baseUrl: "/api/v1",
      sleep: async () => {},
      random: () => 0,
      onStaleClient: (build) => builds.push(build),
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse(503, { status: 503, code: "unavailable", message: "Busy", requestId: "r" }, { "retry-after": "0", "x-saas-server-build": "1" });
        }
        return jsonResponse(200, { ok: true }, { "x-saas-server-build": "2" });
      },
    });
    const response = await client.fetch("/billing");
    expect(response.status).toBe(200);
    expect(builds).toEqual(["2"]);
  });

  it("rebuilds a 204 without a body", async () => {
    const client = new SaasClient({
      baseUrl: "/api/v1",
      fetch: async () => new Response(null, { status: 204 }),
    });
    const response = await client.fetch("/auth/logout", { method: "POST" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("refuses requests while idle", async () => {
    const client = new SaasClient({ baseUrl: "/api/v1", fetch: async () => jsonResponse(200, {}) });
    client.setIdle(true);
    await expect(client.fetch("/billing")).rejects.toBeInstanceOf(SaasIdleError);
  });
});

describe("billing and preferences", () => {
  it("stops reconcile when checkout leaves processing", async () => {
    const states = ["processing", "succeeded"] as const;
    let index = 0;
    const snapshot = await reconcileCheckout(async () => {
      const checkoutState = states[index] ?? "succeeded";
      index += 1;
      return parseBillingSnapshot({
        planId: "pro",
        renewsAt: null,
        cancelAtPeriodEnd: false,
        paymentState: "ok",
        checkoutState,
        entitlements: {},
        usage: [],
      });
    }, 4, 0, async () => {});
    expect(snapshot.checkoutState).toBe("succeeded");
    expect(index).toBe(2);
  });

  it("syncs billing with POST", async () => {
    const methods: string[] = [];
    const client = new SaasClient({
      baseUrl: "/api/v1",
      fetch: async (_url, init) => {
        methods.push(init?.method ?? "GET");
        return jsonResponse(200, {
          planId: "pro",
          renewsAt: null,
          cancelAtPeriodEnd: false,
          paymentState: "ok",
          checkoutState: "succeeded",
          entitlements: {},
          usage: [],
        });
      },
    });
    const snapshot = await syncBilling(client, "/billing/sync");
    expect(methods).toEqual(["POST"]);
    expect(snapshot.planId).toBe("pro");
  });

  it("merges preference patches in memory", () => {
    const saved = new Map<string, string>();
    const store = createPreferenceStore("prefs", { reduceMotion: false }, {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
    });
    store.update({ reduceMotion: true });
    expect(store.read().reduceMotion).toBe(true);
  });
});
