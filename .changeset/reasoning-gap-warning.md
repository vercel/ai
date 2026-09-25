---
'ai': patch
'@ai-sdk/google': patch
'@ai-sdk/provider': patch
---

Warn when Google/Vertex returns reasoning tokens in usage but no reasoning content parts in the stream. Adds optional `warnings` to the `finish` stream part and propagates them to the `finish-step` stream part.
