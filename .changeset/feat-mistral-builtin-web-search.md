---
'@ai-sdk/mistral': minor
---

Add built-in `web_search` and `web_search_premium` tool support to `@ai-sdk/mistral`. These tools can now be passed via `mistral.tools.webSearch()` / `mistral.tools.webSearchPremium()`, letting Mistral models perform live web searches without any client-side execution handler.
