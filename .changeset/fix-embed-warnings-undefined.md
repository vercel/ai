---
'ai': patch
---

Normalize `undefined` warnings from `EmbeddingModelV2` providers to `[]` — prevents `onFinish` callbacks from receiving `undefined` where `Array<Warning>` is expected.
