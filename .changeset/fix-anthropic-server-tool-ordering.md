---
'@ai-sdk/anthropic': patch
---

fix(anthropic): reorder assistant content so server_tool_use/web_search_tool_result appear before tool_use

When the model calls both a provider-executed tool (web_search, code_execution)
and a regular tool in the same turn, the Anthropic API requires that
server_tool_use + web_search_tool_result blocks appear before regular tool_use
blocks. Previously, content was pushed in insertion order, which could place
server_tool_use/web_search_tool_result after tool_use and cause the API to
return "tool_use ids were found without tool_result blocks immediately after".
