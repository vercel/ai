---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): decode base64 without ~25x memory overhead and event loop blocking

`convertBase64ToUint8Array` now uses `Uint8Array.fromBase64` when available and otherwise fills a preallocated `Uint8Array`, instead of `Uint8Array.from(string, mapFn)`. This affects reading `uint8Array` from generated files (e.g. `generateImage` results).
