# @mockmarlin/saas-kit

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Mock-Marlin/saas-kit)](https://github.com/Mock-Marlin/saas-kit)

Headless React kit for session, billing, notifications, uploads, and operations. It renders no markup of its own. Pass `renderIdle` when you want an idle screen.

The URL prefix comes from `@mockmarlin/saas-contract` `createPaths`. This package does not invent `/api/v1`.

Requires Node.js 24 or newer, React 19, and the contract package.

## Install

```bash
npm install @mockmarlin/saas-kit @mockmarlin/saas-contract react react-dom
```

## Minimal app

```tsx
import { createPaths } from "@mockmarlin/saas-contract";
import { createSaasKit } from "@mockmarlin/saas-kit";

const kit = createSaasKit({
  paths: createPaths("/api/v1"),
  session: { loadUser: async () => ({ id: "ada" }) },
  presence: { idleMs: 15 * 60 * 1000 },
});

export function App() {
  return (
    <kit.Provider renderIdle={(resume) => <button onClick={resume}>Refresh</button>}>
      <Home />
    </kit.Provider>
  );
}
```

`kit.client.fetch("/billing")` joins that path onto the prefix. Identical in-flight reads share one response. A 401 runs one refresh and retries once. While the client is idle, `fetch` throws `SaasIdleError`.

## What to read next

| Guide | What it covers |
|---|---|
| [docs/setup.md](docs/setup.md) | Provider, session, and idle |
| [docs/configuration.md](docs/configuration.md) | Options |
| [docs/api.md](docs/api.md) | Exports |
| [docs/billing.md](docs/billing.md) | Snapshot, checkout, and reconcile |
| [docs/notifications.md](docs/notifications.md) | Stream, leader tab, and poll fallback |
| [docs/network.md](docs/network.md) | Coalescing, retry, and the build header |

Merchant allowlists are subpath exports: `@mockmarlin/saas-kit/billing/dodo`, `stripe`, and `paddle`. PostHog is `@mockmarlin/saas-kit/analytics/posthog`.

## Contributing

Issues and pull requests: [github.com/Mock-Marlin/saas-kit](https://github.com/Mock-Marlin/saas-kit).

Use Node.js 24 or newer.

```bash
npm test
npm run lint
npm run build
```

`npm test` runs Vitest. `npm run lint` typechecks the source and the tests. `npm run build` emits `dist/` with declarations.

## License

[MIT](LICENSE) © 2026 MockMarlin
