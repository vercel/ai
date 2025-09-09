---
'@ai-sdk/anthropic': patch
---

fix(anthropic): ensure tool_result parts immediately follow corresponding tool_use (fixes #8516)

- Normalize role:"tool" messages into user messages with tool_result first.
- Reorder assistant mixed content (text before tool_use).
- Serialize JSON outputs consistently; set is_error only for error outputs.

Adds focused tests (repro + ordering edge cases).
