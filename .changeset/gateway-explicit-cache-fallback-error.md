---
'@ai-sdk/gateway': patch
---

Add `GatewayExplicitCacheFallbackError` so a Gateway refusal to serve an explicit provider cache reference (e.g. Gemini `cachedContent`) on fallback credentials surfaces as a typed, non-retryable error instead of collapsing into `GatewayInternalServerError`.
