---
'@ai-sdk/gateway': patch
---

feat(gateway): add `gateway.files()` for uploading files to AI Gateway and referencing them in decision model calls

Gateway error classes now accept an optional `isRetryable` override, which the files interface sets from the gateway's retry hint. Without an override, retryability is still derived from the status code, so other requests behave as before.
