/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import type { SessionUser } from "@mockmarlin/saas-contract";

export interface SessionSnapshot<TUser extends SessionUser> {
  user: TUser | null;
  loading: boolean;
}

export class SessionStore<TUser extends SessionUser> {
  private user: TUser | null = null;
  private loading = true;
  private snapshot: SessionSnapshot<TUser> = { user: null, loading: true };
  private readonly listeners = new Set<() => void>();
  private readonly channel: BroadcastChannel | null;
  private readonly loadUser: (() => Promise<TUser | null>) | undefined;
  private broadcasting = false;

  constructor(loadUser: (() => Promise<TUser | null>) | undefined, channelName: string) {
    this.loadUser = loadUser;
    this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
    this.channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data === "object" && data !== null && "type" in data && data.type === "logout") {
        this.clear(false);
      }
    });
  }

  getSnapshot = (): SessionSnapshot<TUser> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async load(): Promise<void> {
    if (this.loadUser === undefined) {
      this.loading = false;
      this.publish();
      return;
    }
    try {
      this.user = await this.loadUser();
    } catch {
      this.user = null;
    } finally {
      this.loading = false;
      this.publish();
    }
  }

  apply(user: TUser): void {
    this.user = user;
    this.loading = false;
    this.publish();
  }

  clear(broadcast = true): void {
    this.user = null;
    this.loading = false;
    this.publish();
    if (broadcast && !this.broadcasting) {
      this.broadcasting = true;
      this.channel?.postMessage({ type: "logout" });
      this.broadcasting = false;
    }
  }

  private publish(): void {
    this.snapshot = { user: this.user, loading: this.loading };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
