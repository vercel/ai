---
'ai': patch
---

fix(ai): skip schema validation for historical tool parts in terminal states

Tool parts in terminal states (output-available, output-error, output-denied) no longer throw TypeValidationError when their schema is not registered. This fixes issues with MCP servers that disconnect between conversation turns, where historical tool parts from no-longer-registered tools would cause validation failures.
