---
'ai': patch
---

Resolve tool calls that are skipped because of the model finish reason with a `ToolCallNotExecutedError` tool error. Previously they stayed pending, which left UI tool parts in `input-available` and response messages with a tool call that had no result.
