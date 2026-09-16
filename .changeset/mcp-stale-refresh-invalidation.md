---
'@ai-sdk/mcp': patch
---

fix(mcp): pass the rejected token generation to OAuth credential invalidation

When a token refresh was rejected with `invalid_grant`, `auth()` invalidated
`tokens` unconditionally. With credential storage shared by multiple clients
(for example, two replicas), the rejected refresh could have lost a rotation
race, and the unconditional invalidation deleted the newer credential that the
winning refresh had already persisted.

`InvalidGrantError` now carries the exact token generation the refresh attempt
used, and `invalidateCredentials(scope, context)` receives it as an optional
`context.tokens`. Providers can compare that generation against what is
currently stored and only delete it when it still matches. The AS-pin
mismatch invalidation carries the stored generation as well. The interface
change is additive; providers that ignore `context` keep the previous
unconditional behavior.
