---
"@ai-sdk/workflow": patch
---

Fix `stepNumber` on telemetry events emitted by `WorkflowAgent.stream` so per-step telemetry integrations (e.g. `@ai-sdk/devtools`) correctly key state per step. Previously every step's `onStepFinish` and the user-facing `onStepFinish` callback received `step.stepNumber === 0` because `doStreamStep` hard-codes it; the iterator now overrides it with the actual index.
