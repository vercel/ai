---
'ai': patch
---

Prevent excessive memory and CPU usage when validating UI messages with deeply nested provider or tool metadata. `validateUIMessages`, `safeValidateUIMessages`, and the agent UI stream helpers validated JSON values in `providerMetadata`, `callProviderMetadata`, `resultProviderMetadata`, `toolMetadata`, and citation metadata with a recursive union schema that needed several times the memory of the value, so a valid request could exhaust the memory of a worker before the model was called. These values are now validated in a single pass and are no longer copied, except to remove `__proto__` keys.
