/**
 * Copyright (c) 2026 MockMarlin
 *
 * SPDX-License-Identifier: MIT
 */

export { noopAnalytics } from "./analytics.js";
export type { Analytics } from "./analytics.js";
export { SaasClient, SaasIdleError, readJson } from "./client.js";
export type { SaasRequest } from "./client.js";
export { createSaasKit } from "./create-kit.js";
export type { SaasKit, SaasKitOptions } from "./create-kit.js";
export { reconcileCheckout, canUse } from "./billing.js";
export { applyMotionPreference, createPreferenceStore } from "./preferences.js";
export type { PreferenceStore } from "./preferences.js";
export { createPresence } from "./presence.js";
export { SessionStore } from "./session.js";
