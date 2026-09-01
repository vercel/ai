---
'@ai-sdk/openai': patch
---

feat(openai): implement `getFileMetadata`, `downloadFile` (streaming), and `deleteFile` on the OpenAI files interface, support streaming uploads via `{ type: 'stream' }` data, expose `byteSize`/`createdAt`/`expiresAt` on upload results, and thread `abortSignal`/`headers` through all file operations; blank and dot-segment file ids are rejected/encoded so they cannot retarget request paths
