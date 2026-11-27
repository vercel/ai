---
'@ai-sdk/workflow': patch
---

Fix `WorkflowAgent.onStepEnd` not being called in stream mode for a step that pauses on a tool without `execute`. The paused-step branch only invoked the callback in generate mode; it now runs in both modes so every step in `result.steps` reaches the callback.
