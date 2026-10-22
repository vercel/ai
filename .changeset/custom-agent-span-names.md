---
'@ai-sdk/otel': patch
---

Add an `agentSpanName` option to `OpenTelemetry` to name root agent spans using `functionId` or a custom callback. Preserve model-based span names by default.
