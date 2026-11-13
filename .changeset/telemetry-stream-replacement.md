---
'ai': patch
---

Propagate telemetry subscriber stream replacements to execution result in `runWithTracingChannelSpan` and `redactTelemetryCredentials`.

When an `ai:telemetry` diagnostics channel subscriber (such as Sentry or Datadog) intercepts `ctx.result.stream` in `asyncEnd` and wraps it via `ctx.result.stream = ctx.result.stream.pipeThrough(...)`, the original stream is locked. Previously, credential redaction cloned the result object with a value property descriptor for `stream`, preventing the reassignment from updating the underlying execution result and causing `TypeError [ERR_INVALID_STATE]: The ReadableStream is locked` when the SDK consumed the result. Access and mutations to `result.stream` are now forwarded via accessor descriptors and reconciled upon span completion.
