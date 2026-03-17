---
'ai': patch
---

Remove assistant messages that contain only reasoning parts after pruning tool calls. These messages are invalid for providers like Anthropic that require at least one non-reasoning content block in assistant messages.
