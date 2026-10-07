---
'@ai-sdk/anthropic': patch
'@ai-sdk/gateway': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/google-vertex': patch
---

feat(anthropic): add Claude Haiku 5.5 support

- add the `claude-haiku-5-5` model ID to `@ai-sdk/anthropic` and `@ai-sdk/google-vertex`, `anthropic.claude-haiku-5-5` and `us.anthropic.claude-haiku-5-5` to `@ai-sdk/amazon-bedrock`, and `anthropic/claude-haiku-5.5` to `@ai-sdk/gateway`
- recognize `claude-haiku-5-5` as a known model with a 128k max output token limit and all five effort levels; thinking can be disabled up to `high` effort, and `xhigh` and `max` are lowered to `high` with a warning when thinking is disabled
- `claude-haiku-5-5` does not support thinking token budgets: `thinking: { type: 'enabled', budgetTokens }` is converted to adaptive thinking with a warning
