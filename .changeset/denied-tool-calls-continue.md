---
'ai': patch
---

Treat denied tool calls (`output-denied`) as complete in `lastAssistantMessageIsCompleteWithToolCalls`, like `output-error`, so `sendAutomaticallyWhen` continues the chat after a step with a denied tool call.
