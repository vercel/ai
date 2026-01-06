---
'@ai-sdk/anthropic': patch
---

fix(anthropic): enable structured output support for claude-haiku-4-5

This fixes an issue where the `strict: true` property was not included in the request body when using tools with Claude Haiku 4.5, because `supportsStructuredOutput` was incorrectly set to `false` for this model.

Claude Haiku 4.5 supports structured outputs, so the `strict` property should be forwarded to the Anthropic API when specified on tools.

