---
'@ai-sdk/gateway': patch
---

fix(gateway): Preserve AbortError and TimeoutError cancellation reasons instead of wrapping them in retryable GatewayResponseError errors with status 500. Propagate these errors from speech and transcription input streams to their output streams without leaving reads pending or causing unhandled rejections.
