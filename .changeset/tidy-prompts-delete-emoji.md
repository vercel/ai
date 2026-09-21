---
'@ai-sdk/tui': patch
---

Fix Backspace splitting emoji and other multi-code-point characters in prompt input. Delete the last grapheme cluster so partially deleted characters are not submitted to the agent.
