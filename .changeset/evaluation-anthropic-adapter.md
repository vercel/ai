---
'@ai-sdk/anthropic': patch
---

Add `anthropic.evaluationModel()` for experimental Choice, Score, and Boolean evaluations through Messages structured output, with exact labels, validated score bounds, and prompted Boolean P(true) estimates validated to be in [0, 1]. Boolean estimates are not guaranteed to be calibrated; application code chooses thresholds.
