---
'@ai-sdk/workflow': patch
---

Enrich WorkflowAgent callback event shapes to align with ToolLoopAgent:
- Add `stepNumber` to `onToolCallStart` and `onToolCallFinish`
- Add `steps` (previous step results) to `onStepStart`
- Adopt discriminated union pattern (`success: true/false`) for `onToolCallFinish`
- Add `durationMs` to `onToolCallFinish`
