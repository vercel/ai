---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

Download Google Vertex tool result files with the `fetch` passed to `createGoogleVertex` instead of the runtime's global fetch, and limit each download to `toolResultDownloads.maxBytes` (7 MiB by default). A configured transport, such as one that validates DNS at connect time, now also applies to these tool result downloads.
