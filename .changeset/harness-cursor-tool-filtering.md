---
"@ai-sdk/harness-cursor": patch
---

feat(harness-cursor): support built-in tool filtering via auto-rejection

Forward `builtinToolFiltering` from `HarnessAgent` through the bridge and deny inactive Cursor built-in tool calls in the event stream.
