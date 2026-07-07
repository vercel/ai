---
"@ai-sdk/workflow": patch
---

Reduce the `doStreamStep` step-boundary payload by returning minimal raw aggregates and reconstructing the `StepResult` outside the step, instead of serializing the full `StepResult` plus the per-chunk array into the durable event log.
