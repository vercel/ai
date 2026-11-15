---
'ai': patch
---

Reduce memory and CPU usage when validating UI messages with deeply nested provider metadata. `validateUIMessages` and `safeValidateUIMessages` validated JSON values in `providerMetadata` and `callProviderMetadata` with a recursive union schema that needed several times the memory of the value. These values are now validated in a single pass and are no longer copied, except to remove `__proto__` keys.
