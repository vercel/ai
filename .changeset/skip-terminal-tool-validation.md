---
'ai': patch
---

Skip schema validation for tool parts in terminal states (output-available, output-error, output-denied) when the tool is no longer registered. Fixes TypeValidationError when conversation history contains tools from disconnected MCP servers.
