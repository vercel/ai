---
'ai': patch
---

Validate persisted typed tool calls against current input and output schemas.
Schema-incompatible empty or error inputs and terminal history from unavailable
tools remain loadable as dynamic tool parts instead of exposing unvalidated
values under current static tool types.
