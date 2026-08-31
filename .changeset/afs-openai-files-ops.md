---
'@ai-sdk/openai': patch
---

feat(openai): implement `retrieveFile`, `downloadFile` (streaming), and `deleteFile` on the OpenAI files interface, support streaming uploads via `{ type: 'stream' }` data, and thread `abortSignal`/`headers` through all file operations
