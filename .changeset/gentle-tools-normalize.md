---
'@ai-sdk/anthropic': patch
---

Normalize dangling programmatic tool caller references in conversation history after pruning. Before a subsequent user message, omit caller metadata whose source code execution call is missing and emit a warning, preserving the retained tool calls and results. Keep caller metadata unchanged for active tool continuations.
