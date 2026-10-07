/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

export interface PreferenceStore<T extends object> {
  read: () => T;
  update: (patch: Partial<T>) => void;
  subscribe: (listener: () => void) => () => void;
}

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function createPreferenceStore<T extends object>(
  storageKey: string,
  defaults: T,
  storage: MemoryStorage | undefined = globalStorage(),
  onChange?: (value: T) => void,
): PreferenceStore<T> {
  let current = readStored(storage, storageKey, defaults);
  const listeners = new Set<() => void>();
  onChange?.(current);

  function publish(next: T): void {
    current = next;
    onChange?.(current);
    for (const listener of listeners) {
      listener();
    }
  }

  const store: PreferenceStore<T> = {
    read: () => current,
    update(patch) {
      const next = { ...current, ...patch };
      try {
        storage?.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Private mode can reject storage. This tab still keeps the value.
      }
      publish(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  watchOtherTabs(storage, storageKey, defaults, publish);
  return store;
}

function watchOtherTabs<T extends object>(
  storage: MemoryStorage | undefined,
  storageKey: string,
  defaults: T,
  publish: (next: T) => void,
): void {
  if (typeof window === "undefined" || storage !== globalThis.localStorage) {
    return;
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) {
      return;
    }
    publish(readStored(storage, storageKey, defaults));
  });
}

export function applyMotionPreference(reduced: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  if (reduced) {
    document.documentElement.dataset["motion"] = "reduce";
  } else {
    delete document.documentElement.dataset["motion"];
  }
}

function globalStorage(): MemoryStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readStored<T extends object>(storage: MemoryStorage | undefined, key: string, defaults: T): T {
  try {
    const raw = storage?.getItem(key);
    if (raw === undefined || raw === null) {
      return defaults;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return defaults;
    }
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}
