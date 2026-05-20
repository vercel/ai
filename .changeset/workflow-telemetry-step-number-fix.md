---
"@ai-sdk/workflow": patch
---

Fix `stepNumber` on telemetry events emitted by `WorkflowAgent.stream` so per-step telemetry integrations (e.g. `@ai-sdk/devtools`) correctly key state per step.
