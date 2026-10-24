---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): send disabled thinking for Anthropic models

`reasoning: 'none'` and `reasoningConfig: { type: 'disabled' }` were resolved but never sent to Bedrock, so models that default thinking on (e.g. Claude Sonnet 5) kept thinking. Disabled thinking is now forwarded as `thinking: { type: 'disabled' }`, matching `@ai-sdk/anthropic`. Models that reject disabled thinking use `between_tools` thinking where supported, or otherwise drop the setting (`reasoning: 'none'` maps to effort `'low'`) with a warning. Effort above `'high'` is lowered to `'high'` when the model does not accept it with disabled or `between_tools` thinking.
