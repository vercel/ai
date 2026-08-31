---
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
---

feat(provider): extend the FilesV4 interface with optional `retrieveFile`, `downloadFile` (streaming), and `deleteFile` operations, plus `abortSignal`/`headers` call options and a `{ type: 'stream' }` upload data variant; add `postMultipartStreamToApi` (streaming multipart uploads with deterministic part ordering), `deleteFromApi`, and `createBinaryStreamResponseHandler` to provider-utils
