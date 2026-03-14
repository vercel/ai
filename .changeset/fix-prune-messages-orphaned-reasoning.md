---
'ai': patch
---

fix(ai): remove orphaned reasoning-only assistant messages in pruneMessages

`pruneMessages` now removes assistant messages that consist entirely of
reasoning parts after tool-calls are pruned. Previously these "orphaned"
messages caused Anthropic API 400 errors because a valid assistant message
must contain at least one non-reasoning content block. When
`emptyMessages: 'keep'` is set, the reasoning-only messages are preserved
as before.
