---
'ai': patch
---

Removed deprecated `options.throwErrorForEmptyVectors` from `cosineSimilarity()`. Since `throwErrorForEmptyVectors` was the only option the entire `options` argument was removed.

```diff
- cosineSimilarity(vector1, vector2, options)
+cosineSimilarity(vector1, vector2)
```
