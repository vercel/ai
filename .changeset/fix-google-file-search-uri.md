---
'@ai-sdk/google': patch
---

Fixed Zod validation error when using `google.tools.fileSearch()`. The Google File Search API returns `fileSearchStore` instead of `uri` in `retrievedContext`. Updated `extractSources()` function to handle both the old format (Google Search with `uri`) and new format (File Search with `fileSearchStore`), maintaining backward compatibility while preventing validation errors. Also fixed title handling to use `undefined` for URL sources and `'Unknown Document'` for document sources.
