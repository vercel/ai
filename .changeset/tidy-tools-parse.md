---
'ai': patch
---

Add an experimental incremental JSON tool-input parser factory to Chat and readUIMessageStream. Custom parsers receive only new deltas, rehydrate from rawInput when resuming, and release resources when tool input completes or the stream exits.
