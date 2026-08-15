---
'@ai-sdk/deepseek': patch
---

feat(provider/deepseek): add the server-side web search tool. `deepSeek.tools.webSearch()` lets DeepSeek search the web on its own servers; the searches surface as provider-executed tool calls and results, and are replayed on later turns so DeepSeek can restore the results it found. Only available on models created with `deepSeek.responses()`.
