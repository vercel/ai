---
'@ai-sdk/anthropic': patch
---

Add `allowedCallers` to the `webFetch_20260209`, `webFetch_20260318`, `webSearch_20260209`, and `webSearch_20260318` provider tools. Set `allowedCallers: ['direct']` to call web fetch or web search directly without dynamic filtering, which Zero Data Retention and models without programmatic tool calling require.
