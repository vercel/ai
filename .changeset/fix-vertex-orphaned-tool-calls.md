---
'ai': patch
---

fix(ai): filter orphaned provider-executed tool calls without matching results

When using Vertex Anthropic with provider-executed tools like web_search, the API sometimes omits the tool_result from the stream when both provider and client tools are called in the same turn. This causes orphaned tool-call parts to enter the conversation history, leading to API errors.

This fix filters out provider-executed tool calls that have no matching tool-result or tool-error in the response, preventing the orphaned tool-call issue (see #13533).
