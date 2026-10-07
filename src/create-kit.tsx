/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { useEffect, useState, type JSX, type ReactNode } from "react";
import { useSyncExternalStore } from "react";

import type { BillingSnapshot, Operation, SaasPaths, SessionUser } from "@mockmarlin/saas-contract";

import { AccountSessionStore } from "./account-sessions.js";
import { noopAnalytics, type Analytics } from "./analytics.js";
import { canUse, loadBilling, postCheckout, reconcileCheckout, syncBilling } from "./billing.js";
import { SaasClient, type SaasClientOptions } from "./client.js";
import { NotificationInbox } from "./inbox.js";
import { loadOperation, startOperation } from "./operations.js";
import { createPreferenceStore, applyMotionPreference, type PreferenceStore } from "./preferences.js";
import { createPresence, type PresenceController } from "./presence.js";
import { SessionStore } from "./session.js";
import { uploadFile } from "./uploads.js";

export interface SaasKitOptions<TUser extends SessionUser, TPreferences extends object> {
  paths: SaasPaths;
  origin?: string;
  client?: Omit<SaasClientOptions, "baseUrl">;
  session?: { loadUser?: () => Promise<TUser | null> };
  analytics?: Analytics;
  channelName?: string;
  presence?: { idleMs?: number; onLive?: () => void };
  notifications?: { pollMs?: number };
  preferences?: { storageKey: string; defaults: TPreferences };
  allowRedirect?: (url: string) => boolean;
}

export interface SaasKit<TUser extends SessionUser, TPreferences extends object> {
  client: SaasClient;
  paths: SaasPaths;
  session: SessionStore<TUser>;
  analytics: Analytics;
  preferences: PreferenceStore<TPreferences> | null;
  billing: {
    load: () => Promise<BillingSnapshot>;
    checkout: (planId: string, currency?: string) => ReturnType<typeof postCheckout>;
    reconcile: (attempts?: number, delayMs?: number) => Promise<BillingSnapshot>;
    can: (snapshot: BillingSnapshot, feature: string) => boolean;
  };
  upload: (file: Blob, fileName: string, onProgress?: (loaded: number, total: number) => void) => Promise<Awaited<ReturnType<typeof uploadFile>>>;
  operations: {
    start: (name: string) => Promise<Operation>;
    load: (id: string) => Promise<Operation>;
  };
  Provider: (props: { children: ReactNode; renderIdle?: (resume: () => void) => ReactNode }) => JSX.Element;
  useSession: () => { user: TUser | null; loading: boolean };
  useBilling: () => {
    snapshot: BillingSnapshot | null;
    loading: boolean;
    refresh: () => Promise<void>;
    checkout: (planId: string, currency?: string) => ReturnType<typeof postCheckout>;
    reconcile: () => Promise<void>;
    can: (feature: string) => boolean;
  };
  useNotifications: () => ReturnType<NotificationInbox["getSnapshot"]> & {
    markSeen: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    reload: () => Promise<void>;
  };
  useAccountSessions: () => ReturnType<AccountSessionStore["getSnapshot"]> & {
    reload: () => Promise<void>;
    revoke: (id: string) => Promise<void>;
  };
  usePreferences: () => TPreferences;
  useOperation: (id: string | null) => { operation: Operation | null; error: string | null };
}

export function createSaasKit<TUser extends SessionUser, TPreferences extends object = Record<string, never>>(
  options: SaasKitOptions<TUser, TPreferences>,
): SaasKit<TUser, TPreferences> {
  const origin = options.origin?.replace(/\/$/, "") ?? "";
  const baseUrl = `${origin}${options.paths.basePath}`;
  const clientOptions = options.client ?? {};
  const client = new SaasClient({ ...clientOptions, baseUrl });
  const channelName = options.channelName ?? "saas-kit";
  const session = new SessionStore(options.session?.loadUser, channelName);
  const analytics = options.analytics ?? noopAnalytics;
  const preferences = options.preferences === undefined
    ? null
    : createPreferenceStore(options.preferences.storageKey, options.preferences.defaults, undefined, (value) => {
        if ("reduceMotion" in value && typeof value["reduceMotion"] === "boolean") {
          applyMotionPreference(value["reduceMotion"]);
        }
      });
  const inbox = new NotificationInbox(
    client,
    options.paths.notifications.listPath,
    options.paths.notifications.streamPath,
    options.paths.notifications.seenPath,
    options.paths.notifications.deletePath,
    options.notifications?.pollMs ?? 15_000,
    channelName,
  );
  const accountSessions = new AccountSessionStore(client, options.paths.sessions.listPath, options.paths.sessions.revokePath);
  const idleMs = options.presence?.idleMs ?? 15 * 60 * 1000;

  const billing = {
    load: () => loadBilling(client, options.paths.billing.snapshotPath),
    checkout: (planId: string, currency?: string) => postCheckout(client, options.paths.billing.checkoutPath, planId, currency, options.allowRedirect),
    reconcile: (attempts?: number, delayMs?: number) => reconcileCheckout(
      () => syncBilling(client, options.paths.billing.syncPath),
      attempts,
      delayMs,
    ),
    can: canUse,
  };

  function Provider({ children, renderIdle }: { children: ReactNode; renderIdle?: (resume: () => void) => ReactNode }): JSX.Element {
    const [presence] = useState<PresenceController>(() => createPresence({
      idleMs,
      client,
      ...(options.presence?.onLive === undefined ? {} : { onLive: options.presence.onLive }),
      ...(typeof document === "undefined" ? {} : { target: document }),
    }));
    useEffect(() => {
      void session.load();
      return () => {
        presence.stop();
        inbox.disconnect();
      };
    }, [presence]);
    const idle = useSyncExternalStore(presence.subscribe, presence.getSnapshot, () => false);
    return (
      <>
        {children}
        {idle && renderIdle !== undefined ? renderIdle(() => presence.resume()) : null}
      </>
    );
  }

  function useSession(): { user: TUser | null; loading: boolean } {
    return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  }

  function useBilling(): SaasKit<TUser, TPreferences>["useBilling"] extends () => infer R ? R : never {
    const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    async function refresh(): Promise<void> {
      setLoading(true);
      try {
        setSnapshot(await billing.load());
      } finally {
        setLoading(false);
      }
    }
    useEffect(() => {
      void refresh();
    }, []);
    return {
      snapshot,
      loading,
      refresh,
      checkout: async (planId, currency) => {
        const result = await billing.checkout(planId, currency);
        await refresh();
        return result;
      },
      reconcile: async () => {
        setSnapshot(await billing.reconcile());
      },
      can: (feature) => snapshot !== null && billing.can(snapshot, feature),
    };
  }

  function useNotifications(): ReturnType<SaasKit<TUser, TPreferences>["useNotifications"]> {
    const snapshot = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot, inbox.getSnapshot);
    useEffect(() => {
      inbox.connect();
      return () => inbox.disconnect();
    }, []);
    return {
      ...snapshot,
      markSeen: (id) => inbox.markSeen(id),
      remove: (id) => inbox.remove(id),
      reload: () => inbox.reload(),
    };
  }

  function useAccountSessions(): ReturnType<SaasKit<TUser, TPreferences>["useAccountSessions"]> {
    const snapshot = useSyncExternalStore(accountSessions.subscribe, accountSessions.getSnapshot, accountSessions.getSnapshot);
    useEffect(() => {
      void accountSessions.load();
    }, []);
    return {
      ...snapshot,
      reload: () => accountSessions.load(),
      revoke: (id) => accountSessions.revoke(id),
    };
  }

  function usePreferences(): TPreferences {
    const read = preferences?.read ?? (() => ({}) as TPreferences);
    const subscribe = preferences?.subscribe ?? (() => () => {});
    return useSyncExternalStore(subscribe, read, read);
  }

  function useOperation(id: string | null): { operation: Operation | null; error: string | null } {
    const [operation, setOperation] = useState<Operation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const idle = client.idle;
    useEffect(() => {
      if (id === null) {
        return;
      }
      const operationId = id;
      let stopped = false;
      let timer: number | null = null;
      async function tick(): Promise<void> {
        if (stopped || client.idle || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
          return;
        }
        try {
          const next = await loadOperation(client, options.paths.operations.itemPath, operationId);
          if (stopped) {
            return;
          }
          setOperation(next);
          setError(null);
          if (next.status === "queued" || next.status === "running") {
            timer = setTimeout(() => {
              void tick();
            }, next.pollAfterMs) as unknown as number;
          }
        } catch (reason: unknown) {
          if (!stopped) {
            setError(reason instanceof Error ? reason.message : "Operation failed");
          }
        }
      }
      void tick();
      return () => {
        stopped = true;
        if (timer !== null) {
          clearTimeout(timer);
        }
      };
    }, [id, idle]);
    return { operation, error };
  }

  return {
    client,
    paths: options.paths,
    session,
    analytics,
    preferences,
    billing,
    upload: (file, fileName, onProgress) => uploadFile(client, options.paths.uploads.preparePath, options.paths.uploads.completePath, file, fileName, onProgress),
    operations: {
      start: (name) => startOperation(client, options.paths.operations.createPath, name),
      load: (id) => loadOperation(client, options.paths.operations.itemPath, id),
    },
    Provider,
    useSession,
    useBilling,
    useNotifications,
    useAccountSessions,
    usePreferences,
    useOperation,
  };
}
