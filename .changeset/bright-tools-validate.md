---
'ai': patch
---

Validate persisted typed tool calls against current input and output schemas
while preserving unparsed error history. Terminal history from unavailable
tools is normalized to dynamic tool parts so it remains loadable without
exposing unvalidated values under current static tool types.
