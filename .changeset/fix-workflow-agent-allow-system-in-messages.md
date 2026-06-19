---
'@ai-sdk/workflow': patch
---

`WorkflowAgent` now rejects system messages inside `prompt` or `messages` by default, matching the behavior of `generateText`/`streamText`. Set `allowSystemInMessages: true` to opt in to the previous behavior.
