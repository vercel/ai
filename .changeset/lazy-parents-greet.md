---
'@ai-sdk/xai': patch
---

Add native `file_search` server-side tool support:

- Add `xai.tools.fileSearch()` for vector store search with `vectorStoreIds` and `maxNumResults` parameters
- Add `include` option supporting `file_search_call.results` to get inline search results
- Add `file_search_call` handling in language model for both `doGenerate` and `doStream`
- Fix invalid `grok-4-1` model type (only `grok-4-1-fast-reasoning` and `grok-4-1-fast-non-reasoning` exist)
