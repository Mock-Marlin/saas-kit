/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

import { posthog } from "posthog-js";

import { noopAnalytics, type Analytics } from "../analytics.js";

interface PostHogClient {
  init: (key: string, config: { api_host: string } & Record<string, unknown>) => void;
  identify: (id: string, properties?: Record<string, string | number | boolean | null>) => void;
  group: (type: string, id: string, properties?: Record<string, string | number | boolean | null>) => void;
  capture: (name: string, properties?: Record<string, string | number | boolean>) => void;
  reset: () => void;
}

export function createPosthogAnalytics(options: {
  key: string;
  host?: string;
  config?: Record<string, unknown>;
}): Analytics {
  if (options.key.trim().length === 0) {
    return noopAnalytics;
  }
  const client = posthog as unknown as PostHogClient;
  client.init(options.key, { api_host: options.host ?? "https://us.i.posthog.com", ...(options.config ?? {}) });
  return {
    identify: (id, properties) => {
      client.identify(id, properties);
    },
    group: (type, id, properties) => {
      client.group(type, id, properties);
    },
    capture: (name, properties) => {
      client.capture(name, properties);
    },
    reset: () => {
      client.reset();
    },
  };
}
