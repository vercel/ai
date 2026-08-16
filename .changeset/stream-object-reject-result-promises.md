---
"ai": patch
---

fix (streamObject): reject result promises on error so `result.object` and friends no longer hang forever when `doStream` throws, the provider emits an error part mid-stream, or the raw stream errors
