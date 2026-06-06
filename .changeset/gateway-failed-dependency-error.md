---
'@ai-sdk/gateway': patch
---

Add `GatewayFailedDependencyError` so a Gateway `failed_dependency` response (HTTP 424) surfaces as a typed, non-retryable error instead of collapsing into `GatewayInternalServerError`.
