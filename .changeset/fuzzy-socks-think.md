---
'ai': patch
---

fix: normalize encrypted reasoning metadata for split gpt-5.4 reasoning parts

When a streamed reasoning item is split into multiple consecutive reasoning parts that share the same provider `itemId`, the AI SDK now preserves the final encrypted reasoning payload across the recorded assistant message content instead of exposing inconsistent per-part metadata.
