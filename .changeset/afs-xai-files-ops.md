---
'@ai-sdk/xai': patch
---

feat(xai): implement `retrieveFile`, `downloadFile` (streaming), and `deleteFile` on the xAI files interface, support `expiresAfter` upload TTLs (emitted before the file part, as xAI requires) and streaming uploads via `{ type: 'stream' }` data, and thread `abortSignal`/`headers` through all file operations
