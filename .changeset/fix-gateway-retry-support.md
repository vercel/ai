---
'@ai-sdk/gateway': patch
'ai': patch
---

fix(gateway): enable retry support for Gateway errors

Gateway errors (`GatewayInternalServerError`, `GatewayRateLimitError`, `GatewayTimeoutError`) are now retried according to `maxRetries`. Previously, `asGatewayError()` converted retryable `APICallError` instances into `GatewayError` subclasses that the retry logic did not recognize, silently disabling retries for all `@ai-sdk/gateway` users.
