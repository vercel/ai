---
'@ai-sdk/anthropic': patch
---

Fix `toolset_name` being dropped for tools named like Object.prototype members (`constructor`, `toString`): `getAnthropicToolsetName` now checks `toolsetNames` with `hasOwnProperty` so unmapped names fall through to the `toolsetName` provider-metadata fallback.
