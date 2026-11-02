---
'@ai-sdk/perplexity': patch
---

Honor `toolChoice: 'none'` by omitting function and native tools and disabling preset tool calls with `max_tool_calls: 0`.
