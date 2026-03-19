---
'ai': patch
---

Defer tool execution until after the LLM response stream completes.

Previously, tool calls were executed immediately (fire-and-forget) as `tool-call` chunks arrived from the provider stream. Now, tool calls are buffered during streaming and executed in parallel after the LLM response finishes. This cleanly separates the LLM generation phase from the tool execution phase.

This is a **behavioral change**: tool results will no longer appear interleaved with provider stream chunks. They will always appear after the provider stream finishes.
