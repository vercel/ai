---
'@ai-sdk/gateway': patch
---

fix(gateway): Preserve AbortError and TimeoutError cancellation reasons instead of wrapping them in retryable GatewayResponseError errors with status 500.
