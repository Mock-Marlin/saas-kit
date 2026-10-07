# Billing

`kit.billing.load` reads the snapshot path. `checkout` posts `{ planId, currency? }` and checks `allowRedirect` before returning a redirect result. `reconcile` posts to the sync path until checkout is no longer `processing`.

`useBilling().can("feature")` is true only when the loaded snapshot's entitlements map has that key set to true.
