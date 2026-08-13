---
'@ai-sdk/amazon-bedrock': patch
---

fix(provider/amazon-bedrock): forward thinking `disabled` for Anthropic models with adaptive thinking

`reasoningConfig: { type: 'disabled' }` (and the top-level `reasoning: 'none'` that maps to it) was dropped instead of being sent to Bedrock. Models with adaptive thinking such as Claude Sonnet 5 turn thinking on by default, so omitting the field left thinking enabled and kept consuming output tokens with no error or warning. The provider now forwards `thinking: { type: 'disabled' }` for those models, matching `@ai-sdk/anthropic`, and lowers `maxReasoningEffort` to `high` when a model rejects disabled thinking above that effort.
