---
'ai': patch
---

`generateText` and `streamText` passed the messages array that `prepareStep` returned to tools and tool approval functions as it was. When `prepareStep` returned the same array for several steps or calls, tool approval functions could not tell the tool calls of one model response from the tool calls of another. The messages array of every step is now created for that step, so the messages that `prepareStep` returns are copied.
