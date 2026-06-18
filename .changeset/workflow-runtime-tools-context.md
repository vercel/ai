---
"@ai-sdk/workflow": patch
---

feat(workflow): add `runtimeContext` and `toolsContext` to `WorkflowAgent`.

`runtimeContext` is shared agent state that flows through `prepareCall`, `prepareStep`, step results, and `onFinish`. `toolsContext` is a per-tool map; each tool receives its own validated entry as `context`, validated against `tool.contextSchema` when defined. The previous `experimental_context` option (and corresponding fields on related callbacks and option types) has been removed — use `runtimeContext` for shared state and `toolsContext` for per-tool values. Context values in `WorkflowAgent` should be serializable because they can cross workflow and step boundaries.
