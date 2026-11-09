---
'@ai-sdk/anthropic': patch
'@ai-sdk/gateway': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/google-vertex': patch
---

feat(anthropic): add Claude Fable 5.2 support

- add the `claude-fable-5-2` model ID to `@ai-sdk/anthropic` and `@ai-sdk/google-vertex`, `anthropic.claude-fable-5-2` and `us.anthropic.claude-fable-5-2` to `@ai-sdk/amazon-bedrock`, and `anthropic/claude-fable-5.2` to `@ai-sdk/gateway`
- recognize `claude-fable-5-2` as a known model with the same capabilities as `claude-fable-5-1`: 128k max output tokens, always-on adaptive thinking, all five effort levels, no sampling parameters, and no forced tool use
