---
'@ai-sdk/gateway': patch
---

Fix intermittent AbortError from internal connection pool not being retried. `asGatewayError` now accepts the caller's `AbortSignal` and only re-throws an `AbortError`/`TimeoutError` as a plain (non-retryable) error when the signal is actually aborted. If the signal is not aborted the error came from an internal source (e.g. undici connection-pool cleanup) and is wrapped as a retryable `GatewayTimeoutError` so the AI SDK retry layer can transparently retry the request.
