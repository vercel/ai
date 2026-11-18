---
'@ai-sdk/otel': patch
---

fix(otel): end the span of a model call when a stream retry or a steering interrupt starts a new one
