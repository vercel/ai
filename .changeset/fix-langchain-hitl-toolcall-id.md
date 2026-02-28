---
'@ai-sdk/langchain': patch
---

fix(langchain): HITL interrupt now uses original tool call ID from messages stream mode

When a tool call was already emitted via the `messages` stream mode, the
values mode skipped the entire block including the key mapping registration.
This caused the HITL interrupt handler to generate a fallback ID instead of
reusing the original `toolCallId`, creating orphaned approval cards.
