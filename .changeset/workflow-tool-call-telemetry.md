---
"@ai-sdk/workflow": patch
---

fix(workflow): emit tool-call telemetry inside workflows and align event shapes

- Dispatch client tool call telemetry from a durable step when global telemetry integrations are configured, matching model call telemetry (#22378).
- Align explicit-integration tool telemetry event shape with core AI SDK by providing `callId`, `toolExecutionMs`, and `toolOutput` (with actual `Error` objects on error) alongside legacy `durationMs` and `success` fields.
- Omit manual tool telemetry for provider-executed tools because OpenTelemetry instrumentation records them automatically on the language model call span via extension spans, preventing duplicate spans.
- Emit tool execution telemetry upon approved tool resume.
- Safely handle tool error serialization and respect `recordOutputs: false` to avoid telemetry failures.

Fixes #23608.
