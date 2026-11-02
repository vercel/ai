---
'@ai-sdk/provider-utils': patch
---

Add `stringifyWithBigIntAndCycles` for provider tool serialization that converts BigInt values to decimal strings and replaces ancestor cycles while preserving shared references and `toJSON` behavior.
