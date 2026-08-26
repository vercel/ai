---
'ai': patch
---

Validate persisted typed tool calls against the current tool set and input
schemas while preserving identifiable legacy aborted calls. Agent continuation
normalizes terminal history from unavailable ephemeral tools to dynamic tool
parts so it remains loadable without exposing unvalidated static tool types.
