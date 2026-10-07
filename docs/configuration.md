# Configuration

| Option | Role |
|---|---|
| `paths` | Required `SaasPaths` from the contract |
| `origin` | Optional absolute origin. Empty means same-origin |
| `client.credentials` | Forwarded to `fetch`. Use `"include"` for cookies |
| `client.refreshSession` | Runs once when any request returns 401. Return true to retry |
| `client.onStaleClient` | Called when `x-saas-server-build` changes |
| `client.timeoutMs` | Default 15000 |
| `session.loadUser` | Loads the user when the provider mounts |
| `presence.idleMs` | Quiet time before idle. Default 15 minutes |
| `presence.onLive` | Runs after the idle refresh |
| `notifications.pollMs` | Fallback poll when the stream fails. Default 15 seconds |
| `preferences` | `storageKey` and `defaults`. `reduceMotion` writes `data-motion` |
| `allowRedirect` | Rejects a checkout URL that returns false |
| `analytics` | `identify`, `group`, `capture`, `reset`. Defaults to a no-op |
| `channelName` | `BroadcastChannel` name for logout and notification fan-out |

`kit.session.apply` and `kit.session.clear` update the store from login and logout. `clear` tells other tabs to drop the session.
