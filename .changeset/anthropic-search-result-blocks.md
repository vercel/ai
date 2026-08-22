---
"@ai-sdk/anthropic": patch
---

feat (provider/anthropic): add search result blocks and custom content documents with native citations

Search result blocks enable Claude to cite specific passages with proper source attribution, matching the citation quality of web search. They can be provided in two ways:

- As file parts with `providerOptions.anthropic.type: 'search_result'` (for example for injecting pre-fetched search results into a message).
- Inside tool results, by returning a `content` tool output whose text parts carry the same provider options. This makes RAG tool results directly citable and is compatible with turns that mix server tools (such as web search) and client tools.

Custom content documents (`source: { type: 'content', content: [...] }`) allow passing pre-chunked text that Claude cites via `content_block_location`.

The new citation types `search_result_location` and `content_block_location` are parsed and returned as source parts with metadata including `citedText`, `source`, `searchResultIndex`, `startBlockIndex`, and `endBlockIndex`.
