---
'ai': patch
---

Reject `generateText` responses that do not satisfy a required or specifically selected tool choice, and expose the normalized response content on `ToolChoiceViolationError` for opt-in recovery.
