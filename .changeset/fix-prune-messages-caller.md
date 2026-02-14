---
'ai': patch
---

fix(ai): trace caller.toolId dependencies in pruneMessages. Prevents orphaned Anthropic caller references when pruning messages with code_execution programmatic tool calling.
