---
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/google': patch
'ai': patch
---

feat(provider): extend the FilesV4 interface with optional `retrieveFile`, `downloadFile` (streaming), and `deleteFile` operations, plus `abortSignal`/`headers` call options and a `{ type: 'stream' }` upload data variant; upload results now expose `byteSize`, `createdAt`, and `expiresAt` (also surfaced by the core `uploadFile()` helper, which now forwards `abortSignal`/`headers`); add `postMultipartStreamToApi` (streaming multipart uploads with deterministic part ordering and failure-path stream teardown), `deleteFromApi`, and `createBinaryStreamResponseHandler` to provider-utils
