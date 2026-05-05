---
"@ai-sdk/workflow": patch
---

feat(workflow): add `runtimeContext` and `toolsContext` to `WorkflowAgent`, plus `telemetry.includeRuntimeContext` and `telemetry.includeToolsContext` for telemetry filtering.

`runtimeContext` is shared agent state that flows through `prepareStep`, lifecycle callbacks, and `onFinish`. `toolsContext` is a per-tool map; each tool receives its own validated entry as `context`, validated against `tool.contextSchema` when defined. The legacy `experimental_context` is kept as a fallback when no `toolsContext` entry is set.
