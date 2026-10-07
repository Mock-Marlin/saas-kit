/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import type { SaasClient } from "./client.js";

export interface PresenceController {
  readonly idle: boolean;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  resume: () => void;
  stop: () => void;
}

export function createPresence(options: {
  idleMs: number;
  client: SaasClient;
  onLive?: () => void;
  target?: Document | undefined;
  schedule?: (callback: () => void, ms: number) => number;
  cancel?: (id: number) => void;
}): PresenceController {
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms) as unknown as number);
  const cancel = options.cancel ?? ((id) => clearTimeout(id));
  let idle = false;
  let timer: number | null = null;
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function enter(): void {
    if (idle) {
      return;
    }
    idle = true;
    options.client.setIdle(true);
    emit();
  }

  function arm(): void {
    if (timer !== null) {
      cancel(timer);
    }
    timer = schedule(enter, options.idleMs);
  }

  const bump = (): void => {
    if (!idle) {
      arm();
    }
  };

  const target = options.target;
  if (target !== undefined) {
    target.addEventListener("pointerdown", bump);
    target.addEventListener("keydown", bump);
    target.addEventListener("scroll", bump, true);
    target.addEventListener("freeze", enter);
  }
  arm();

  return {
    get idle() {
      return idle;
    },
    getSnapshot: () => idle,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resume() {
      idle = false;
      options.client.setIdle(false);
      arm();
      options.onLive?.();
      emit();
    },
    stop() {
      if (timer !== null) {
        cancel(timer);
      }
      if (target !== undefined) {
        target.removeEventListener("pointerdown", bump);
        target.removeEventListener("keydown", bump);
        target.removeEventListener("scroll", bump, true);
        target.removeEventListener("freeze", enter);
      }
    },
  };
}
