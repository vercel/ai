---
'@ai-sdk/workflow': patch
---

Enrich WorkflowAgent callback event shapes to align with ToolLoopAgent:
- Add `stepNumber` to `onToolExecutionStart` and `onToolExecutionEnd`
- Add `steps` (previous step results) to `onStepStart`
- Adopt discriminated union pattern (`success: true/false`) for `onToolExecutionEnd`
- Add `durationMs` to `onToolExecutionEnd`
