---
"@ai-sdk/workflow": patch
---

Remove `maxSteps` option from `WorkflowAgent`. Use `stopWhen` with stop conditions like `isStepCount()` instead.
