# API

| Export | What it does |
|---|---|
| `createSaasKit` | Builds the client, stores, hooks, and provider |
| `SaasClient` | `fetch` with coalescing, retry, refresh, and the idle gate |
| `SaasIdleError` | Thrown while the client is idle |
| `readJson` | Parses a contract value or throws `SaasError` |
| `reconcileCheckout` | Polls until `checkoutState` is not `processing` |
| `canUse` | Reads one entitlement |
| `createPreferenceStore` | Typed JSON preferences |
| `applyMotionPreference` | Sets or clears `data-motion="reduce"` |
| `createPresence` | Idle timer |
| `SessionStore` | User snapshot and cross-tab logout |
| `noopAnalytics` | Analytics that does nothing |
| `createPosthogAnalytics` | `@mockmarlin/saas-kit/analytics/posthog` |
| `allowDodoRedirect` | `@mockmarlin/saas-kit/billing/dodo` |
| `allowStripeRedirect` | `@mockmarlin/saas-kit/billing/stripe` |
| `allowPaddleRedirect` | `@mockmarlin/saas-kit/billing/paddle` |

Hooks on the kit object: `useSession`, `useBilling`, `useNotifications`, `useAccountSessions`, `usePreferences`, `useOperation`.
