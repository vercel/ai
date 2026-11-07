---
'@ai-sdk/perplexity': patch
---

Honor `toolChoice: 'none'` by omitting function and native tools, including MCP and connector configurations, and setting `max_tool_calls: 0` to disable preset tools.
