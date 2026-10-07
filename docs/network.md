# Network

Identical in-flight `GET` and `HEAD` calls share one response body. Each caller still receives its own `Response`.

Idempotent `429` and `503` responses retry twice. `Retry-After` is honored. Other waits use jitter.

`401` runs `refreshSession` once. Waiters share that refresh. The original request runs one more time.

Every call sends `x-request-id`. A changed `x-saas-server-build` calls `onStaleClient`.

Posts from checkout, upload, and operations send `idempotency-key`.

Idle aborts the calls already in flight and rejects new ones until `resume`.
