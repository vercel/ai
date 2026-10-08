---
'ai': patch
---

Raise `MissingToolResultsError` when an approved tool call has no result before sending the history to a provider. This rejects histories where a new user message follows approval before the tool executes.
