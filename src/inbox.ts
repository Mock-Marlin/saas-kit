/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import {
  NOTIFICATION_CREATED_EVENT,
  NOTIFICATION_REMOVED_EVENT,
  parseCursorPage,
  parseNotificationItem,
  type NotificationItem,
} from "@mockmarlin/saas-contract";

import { readJson, type SaasClient } from "./client.js";

export interface InboxSnapshot {
  items: NotificationItem[];
  loaded: boolean;
  error: string | null;
}

export class NotificationInbox {
  private items: NotificationItem[] = [];
  private loaded = false;
  private error: string | null = null;
  private snapshot: InboxSnapshot = { items: [], loaded: false, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly removed = new Set<string>();
  private source: EventSource | null = null;
  private pollTimer: number | null = null;
  private stopped = true;
  private channel: BroadcastChannel | null = null;

  private readonly client: SaasClient;
  private readonly listPath: string;
  private readonly streamPath: string;
  private readonly seenPath: string;
  private readonly deletePath: string;
  private readonly pollMs: number;
  private readonly channelName: string;

  constructor(
    client: SaasClient,
    listPath: string,
    streamPath: string,
    seenPath: string,
    deletePath: string,
    pollMs: number,
    channelName: string,
  ) {
    this.client = client;
    this.listPath = listPath;
    this.streamPath = streamPath;
    this.seenPath = seenPath;
    this.deletePath = deletePath;
    this.pollMs = pollMs;
    this.channelName = channelName;
  }

  getSnapshot = (): InboxSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  receive(item: NotificationItem, broadcast = false): void {
    if (this.removed.has(item.id)) {
      return;
    }
    const existing = this.items.find((entry) => entry.id === item.id);
    const next = existing === undefined ? item : { ...item, seenAt: existing.seenAt ?? item.seenAt };
    this.items = [next, ...this.items.filter((entry) => entry.id !== item.id)];
    this.publish();
    if (broadcast) {
      this.channel?.postMessage({ type: "notification", item: next });
    }
  }

  forget(id: string): void {
    this.removed.add(id);
    this.items = this.items.filter((entry) => entry.id !== id);
    this.publish();
  }

  async reload(): Promise<void> {
    try {
      const response = await this.client.fetch(this.listPath);
      const page = await readJson(response, (value) => parseCursorPage(value, parseNotificationItem));
      this.items = page.items.filter((item) => !this.removed.has(item.id));
      this.loaded = true;
      this.error = null;
    } catch (error: unknown) {
      this.loaded = true;
      this.error = error instanceof Error ? error.message : "Notifications failed";
    }
    this.publish();
  }

  connect(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    if (this.channel === null && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.addEventListener("message", (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (typeof data !== "object" || data === null || !("type" in data)) {
          return;
        }
        if (data.type === "notification" && "item" in data) {
          try {
            this.receive(parseNotificationItem(data.item));
          } catch {
            this.error = "Notification stream sent an unexpected payload";
            this.publish();
          }
        }
        if (data.type === "notification.removed" && "id" in data && typeof data.id === "string") {
          this.forget(data.id);
        }
      });
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    void this.reload();
    this.openLeader();
  }

  disconnect(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    this.channel?.close();
    this.channel = null;
  }

  private readonly onVisibility = (): void => {
    if (typeof document === "undefined") {
      return;
    }
    if (document.visibilityState === "hidden") {
      this.source?.close();
      this.source = null;
      return;
    }
    if (!this.stopped) {
      this.openLeader();
    }
  };

  async markSeen(id: string): Promise<void> {
    const current = this.items.find((item) => item.id === id);
    if (current !== undefined && current.seenAt === null) {
      this.receive({ ...current, seenAt: new Date().toISOString() });
    }
    const response = await this.client.fetch(this.seenPath.replace(":id", encodeURIComponent(id)), { method: "POST" });
    const item = await readJson(response, parseNotificationItem);
    this.receive(item);
  }

  async remove(id: string): Promise<void> {
    const previous = this.items;
    this.forget(id);
    try {
      const response = await this.client.fetch(this.deletePath.replace(":id", encodeURIComponent(id)), { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
    } catch (error: unknown) {
      this.removed.delete(id);
      this.items = previous;
      this.publish();
      throw error;
    }
  }

  private openLeader(): void {
    if (this.stopped || this.client.idle) {
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    const start = (): void => {
      this.openStream();
    };
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (locks === undefined) {
      start();
      return;
    }
    void locks.request(`saas-notifications:${this.channelName}`, { mode: "exclusive" }, () => {
      if (this.stopped) {
        return Promise.resolve();
      }
      start();
      return new Promise<void>((resolve) => {
        const finish = (): void => resolve();
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
              this.source?.close();
              finish();
            }
          }, { once: true });
        }
      });
    });
  }

  private openStream(): void {
    if (typeof EventSource === "undefined") {
      this.schedulePoll();
      return;
    }
    const source = new EventSource(this.client.url(this.streamPath), { withCredentials: true });
    this.source = source;
    source.addEventListener(NOTIFICATION_CREATED_EVENT, (event) => {
      const message = event as MessageEvent<string>;
      try {
        this.receive(parseNotificationItem(JSON.parse(message.data)), true);
      } catch {
        this.error = "Notification stream sent an unexpected payload";
        this.publish();
      }
    });
    source.addEventListener(NOTIFICATION_REMOVED_EVENT, (event) => {
      const message = event as MessageEvent<string>;
      try {
        const body: unknown = JSON.parse(message.data);
        if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
          this.forget(body.id);
          this.channel?.postMessage({ type: "notification.removed", id: body.id });
        }
      } catch {
        this.error = "Notification stream sent an unexpected payload";
        this.publish();
      }
    });
    source.onerror = () => {
      source.close();
      this.schedulePoll();
    };
  }

  private schedulePoll(): void {
    if (this.stopped || this.pollTimer !== null) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.reload();
      if (!this.stopped) {
        this.openLeader();
      }
    }, this.pollMs) as unknown as number;
  }

  private publish(): void {
    this.snapshot = { items: this.items, loaded: this.loaded, error: this.error };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
