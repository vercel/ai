---
'@ai-sdk/workflow': patch
---

Expose `totalUsage` and `finishReason` on the `WorkflowAgent.stream()` result, mirroring `GenerateTextResult`/`StreamTextResult` and the existing `onEnd` event payload.
