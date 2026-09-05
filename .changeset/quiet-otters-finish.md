---
'@ai-sdk/openai': patch
---

fix(openai): accept non-completed function_call and custom_tool_call items in Responses `output_item.done` events (tool calls truncated by `max_output_tokens`)
