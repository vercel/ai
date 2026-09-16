---
'@ai-sdk/google': patch
---

Add `google.evaluationModel()` for experimental Choice, Score, and Boolean evaluations through Gemini structured output, preserving provider thinking options and validating exact labels and score bounds. Boolean answers contain prompted P(true) estimates validated to be in [0, 1]. Boolean estimates are not guaranteed to be calibrated; application code chooses thresholds.
