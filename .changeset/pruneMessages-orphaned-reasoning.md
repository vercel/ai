---
'ai': patch
---

Fix `pruneMessages` leaving orphaned reasoning parts. When pruning tool calls removed the only non-reasoning content from an assistant message, the message was left containing only reasoning/thinking blocks. Providers such as Anthropic reject these messages because a well-formed assistant message must contain at least one non-reasoning content block. With `emptyMessages: 'remove'` (the default), assistant messages that only contain reasoning parts after pruning are now removed together with truly empty messages.
