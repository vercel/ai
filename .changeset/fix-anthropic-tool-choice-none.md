---
'@ai-sdk/anthropic': patch
---

fix(anthropic): send `tool_choice: { type: "none" }` instead of stripping tools from the request. Previously, setting `toolChoice` to `'none'` removed both `tools` and `tool_choice`, causing the Anthropic API to return empty content when conversation history contained `tool_use`/`tool_result` blocks.
