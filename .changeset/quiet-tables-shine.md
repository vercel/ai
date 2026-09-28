---
'@ai-sdk/tui': patch
---

Escape untrusted terminal control characters in agent output, tool content, errors, titles, and prompts before rendering, preventing terminal escape sequence injection while preserving TUI formatting.
