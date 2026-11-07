---
'@ai-sdk/anthropic': patch
---

Preserve warning-only handling of ignored inline tool additions on the initial system message when named tool choice falls back or the JSON response tool is used. Validate tool-choice restrictions only for inline definitions emitted in the outgoing request.
