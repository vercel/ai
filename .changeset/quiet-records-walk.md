---
'ai': patch
---

Reduce memory and CPU usage when validating UI messages with deeply nested provider or tool metadata. `validateUIMessages` and `safeValidateUIMessages`, which the agent UI stream helpers also use, validated JSON values in `providerMetadata`, `callProviderMetadata`, `resultProviderMetadata`, and `toolMetadata` with a recursive union schema that needed several times the memory of the value. These values are now validated in a single pass and are no longer copied, except to remove `__proto__` keys.
