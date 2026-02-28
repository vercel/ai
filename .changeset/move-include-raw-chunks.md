---
'ai': patch
---

feat(ai): move `includeRawChunks` into `experimental_include` setting as `rawChunks`

Added `rawChunks` option to the `experimental_include` setting in `streamText`. This allows controlling raw chunk inclusion through the same unified `experimental_include` configuration used for other data retention settings. The existing `includeRawChunks` parameter is now deprecated in favor of `experimental_include: { rawChunks: true }`.
