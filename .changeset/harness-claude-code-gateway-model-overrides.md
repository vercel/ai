---
'@ai-sdk/harness-claude-code': patch
---

fix(harness-claude-code): map dotted AI Gateway model ids to the ids Claude Code expects

Requests for ids such as `anthropic/claude-opus-5.5` now get that model's output limit, system prompt and default effort in Claude Code instead of another model's.
