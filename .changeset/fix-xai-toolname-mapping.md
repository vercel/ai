---
"@ai-sdk/xai": patch
---

fix: map server-side tool types to correct toolName when part.name is empty

When xAI returns web_search_call, x_search_call, code_execution_call, or other server-side tool events, the part.name field may be empty or undefined. Previously, this caused AI_NoSuchToolError because the toolName was set to an empty string.

This fix checks part.type in addition to part.name to correctly map the tool call back to the user-provided tool name from the tools object.
