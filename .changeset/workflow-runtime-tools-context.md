---
"@ai-sdk/workflow": patch
---

feat(workflow): replace `experimental_context` with `runtimeContext` and `toolsContext` on `WorkflowAgent`, plus `telemetry.includeRuntimeContext` and `telemetry.includeToolsContext` for telemetry filtering.

`runtimeContext` is shared agent state that flows through `prepareStep`, lifecycle callbacks, and `onFinish`. `toolsContext` is a per-tool map; each tool receives its own validated entry as `context`, validated against `tool.contextSchema` when defined. The previous `experimental_context` option (and corresponding fields on lifecycle callbacks) has been removed — use `runtimeContext` for shared state and `toolsContext` for per-tool values.
