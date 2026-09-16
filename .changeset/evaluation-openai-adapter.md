---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
---

Add experimental Choice, Score, and Boolean evaluations through `openai.evaluationModel()` and a shared structured language-model evaluation adapter. Preserve exact labels and metadata, validate score bounds, and return prompted Boolean P(true) estimates validated to be in [0, 1]. Boolean estimates are not guaranteed to be calibrated; application code chooses thresholds.
