---
'@ai-sdk/workflow': patch
---

Add `experimental_sandbox` support to `WorkflowAgent`. The sandbox is passed to tool execution, configurable on the constructor or per stream, and available to `prepareStep` for per-step overrides.
