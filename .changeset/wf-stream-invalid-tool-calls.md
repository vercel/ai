---
'@ai-sdk/workflow': patch
---

fix(workflow): `WorkflowAgent.stream()` keeps the tool call in the step result when the model calls an unknown tool or passes input that does not match the schema. The call is marked `invalid` and the step has a `tool-error` part, as in `generate()` and `ToolLoopAgent`. The model still receives the error as a tool result.
