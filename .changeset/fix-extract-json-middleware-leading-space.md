---
'ai': patch
---

fix(middleware): preserve leading whitespace in the trailing suffix of streamed text in `extractJsonMiddleware`. Previously, when no markdown code fence was stripped, the default transform's `trim()` was applied to the 12-character suffix buffer, removing a legitimate word-boundary space and fusing the last word with whatever came before it.
