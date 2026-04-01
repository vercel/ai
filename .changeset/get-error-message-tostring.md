---
"@ai-sdk/provider": patch
"@ai-sdk/provider-utils": patch
---

Serialize thrown errors with `Error.prototype.toString()` in `getErrorMessage` so tool and stream error text includes the error name (for example `Error: ...`, `TypeError: ...`, `AbortError: ...`).
