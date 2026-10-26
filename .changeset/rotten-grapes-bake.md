---
"@ai-sdk/provider-utils": patch
---

use native Buffer base64 encoding when available. encoding a `Uint8Array` backed by a detached `ArrayBuffer` now throws a `TypeError` in runtimes with `Buffer` instead of returning an empty string
