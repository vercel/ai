---
'ai': patch
---

Validate persisted typed tool calls against current input and output schemas
while preserving empty-input and unavailable terminal history. Agent
continuation normalizes terminal history from unavailable ephemeral tools to
dynamic tool parts so it remains loadable without exposing unvalidated static
tool types.
