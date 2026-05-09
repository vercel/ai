---
"ai": patch
---

Fix off-by-one in array form of `MockLanguageModelV3` / `V4` and `MockEmbeddingModelV3` / `V4`. The first scripted call now returns the first array entry instead of the second; subsequent calls advance correctly.
