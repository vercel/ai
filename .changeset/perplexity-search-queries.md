---
'@ai-sdk/perplexity': patch
---

Expose the web search queries the Agent API ran as `providerMetadata.perplexity.searchQueries` for `generateText` and `streamText`. Previously only the query count (`usage.numSearchQueries`) was returned and the queries on `search_results` items and `response.reasoning.search_queries` events were dropped.
