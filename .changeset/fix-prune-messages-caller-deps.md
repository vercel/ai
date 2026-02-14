---
'ai': patch
---

Fix `pruneMessages` dropping tool calls referenced via provider-specific caller dependencies (e.g. Anthropic `code_execution` `caller.toolId`), causing "source tool not found" API errors.
