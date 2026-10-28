---
'@ai-sdk/harness': patch
---

Preserve execution-denied outputs for denied host tool calls without invoking the tool's `toModelOutput` converter, preventing corrupted denial responses and turns that fail to complete when adapters echo tool results.
