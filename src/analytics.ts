/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

export interface Analytics {
  identify: (id: string, properties?: Record<string, string | number | boolean | null>) => void;
  group: (type: string, id: string, properties?: Record<string, string | number | boolean | null>) => void;
  capture: (name: string, properties?: Record<string, string | number | boolean>) => void;
  reset: () => void;
}

export const noopAnalytics: Analytics = {
  identify() {},
  group() {},
  capture() {},
  reset() {},
};
