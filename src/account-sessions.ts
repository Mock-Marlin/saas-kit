/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { fillPath, parseAccountSession, parseCursorPage, type AccountSession } from "@mockmarlin/saas-contract";

import { readJson, type SaasClient } from "./client.js";

export interface AccountSessionSnapshot {
  items: AccountSession[];
  loaded: boolean;
  error: string | null;
}

export class AccountSessionStore {
  private items: AccountSession[] = [];
  private loaded = false;
  private error: string | null = null;
  private snapshot: AccountSessionSnapshot = { items: [], loaded: false, error: null };
  private readonly listeners = new Set<() => void>();

  private readonly client: SaasClient;
  private readonly listPath: string;
  private readonly revokePath: string;

  constructor(client: SaasClient, listPath: string, revokePath: string) {
    this.client = client;
    this.listPath = listPath;
    this.revokePath = revokePath;
  }

  getSnapshot = (): AccountSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async load(): Promise<void> {
    try {
      const response = await this.client.fetch(this.listPath);
      const page = await readJson(response, (value) => parseCursorPage(value, parseAccountSession));
      this.items = page.items;
      this.loaded = true;
      this.error = null;
    } catch (error: unknown) {
      this.loaded = true;
      this.error = error instanceof Error ? error.message : "Sessions failed";
    }
    this.publish();
  }

  async revoke(id: string): Promise<void> {
    const previous = this.items;
    this.items = this.items.filter((item) => item.id !== id);
    this.publish();
    try {
      const response = await this.client.fetch(fillPath(this.revokePath, { id }), { method: "POST" });
      if (!response.ok) {
        throw new Error("Revoke failed");
      }
    } catch (error: unknown) {
      this.items = previous;
      this.publish();
      throw error;
    }
  }

  private publish(): void {
    this.snapshot = { items: this.items, loaded: this.loaded, error: this.error };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
