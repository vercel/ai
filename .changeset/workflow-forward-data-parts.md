---
'@ai-sdk/workflow': patch
---

fix(workflow): forward custom `data-*` parts in `createModelCallToUIChunkTransform`

Custom data parts written to the workflow stream with `getWritable()` were dropped by the transform, so they never reached `useChat`. They are now passed through unchanged, matching `ToolLoopAgent` and `DurableAgent`.
