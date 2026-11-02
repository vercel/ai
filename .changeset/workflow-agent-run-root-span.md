---
'@ai-sdk/workflow': patch
'@ai-sdk/otel': patch
'ai': patch
---

Support a single telemetry operation for durable `WorkflowAgent` runs, including the prompt, final output, steps, and tools. Events recorded in the workflow are reported on completion or suspension with their original timestamps. For OpenTelemetry, pass the same `OpenTelemetryIdGenerator` instance as the tracer provider's `idGenerator` and `sampler` and as `new OpenTelemetry({ durable })`. This explicit bridge carries parent trace context and sampling across steps, reports model spans live with provider requests nested beneath them, and reconstructs the enclosing `invoke_agent` tree when the run completes. Without the bridge, existing live per-model tracing is preserved. Add typed experimental durable context hooks for telemetry integrations; remove reliance on process-global ID-generator detection.
