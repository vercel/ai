---
'@ai-sdk/openai': patch
---

Support additionalTools provider options on ordinary Responses tool results. Preserve the result and append function definitions at that history position, omitting matching request-level declarations without changing local tool execution availability.
