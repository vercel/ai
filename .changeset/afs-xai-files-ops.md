---
'@ai-sdk/xai': patch
---

feat(xai): implement `getFileMetadata`, `downloadFile` (streaming), and `deleteFile` on the xAI files interface, support `expiresAfter` upload TTLs (integer 3600–2592000 seconds, emitted before the file part as xAI requires) and streaming uploads via `{ type: 'stream' }` data, expose `byteSize`/`createdAt`/`expiresAt` on upload results, and thread `abortSignal`/`headers` through all file operations; blank and dot-segment file ids are rejected/encoded so they cannot retarget request paths
