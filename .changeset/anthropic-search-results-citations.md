---
"@ai-sdk/anthropic": patch
---

feat(anthropic): search result blocks and custom content documents

This enables Claude to cite specific passages from search results and custom content documents. File parts can now use `type: 'search_result'` or `source: { type: 'content', content: [...] }` in provider options to provide citable content.

New citation types `search_result_location` and `content_block_location` are now properly parsed and returned as `source` parts with metadata including `citedText`, `source`, `searchResultIndex`, `startBlockIndex`, and `endBlockIndex`.
