---
'ai': patch
'@ai-sdk/workflow': patch
---

Honor `tool.toModelOutput` in `WorkflowAgent`.

`WorkflowAgent` now routes successful local, provider-executed, and approved tool results through each tool's optional `toModelOutput` hook, matching `generateText`, `streamText`, and `ToolLoopAgent`. Previously the hook was ignored and results were always serialized as `text` or `json`.

Internally exports the shared tool-result model-output helpers from `ai/internal`, and uses the shared `getErrorMessage` behavior for workflow tool error results.
