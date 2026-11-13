---
'@ai-sdk/workflow': patch
---

fix(workflow): tools called by `WorkflowAgent` no longer receive the system prompt or the assistant message that contains the current tool call in `options.messages`. The `messages` passed to `onToolExecutionStart` and `onToolExecutionEnd` no longer contain the system prompt either. This matches `ToolLoopAgent`, `generateText`, and `streamText`.
