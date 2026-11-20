---
'@ai-sdk/anthropic': patch
'@ai-sdk/minimax': patch
---

Add MiniMax `serviceTier` support for `standard` and `priority` admission. Omit tiers belonging to another known provider with an unsupported-setting warning instead of forwarding incompatible values. Expose the applied `serviceTier`, when returned, in Anthropic-compatible generation, stream and batch metadata without changing existing metadata construction types.
