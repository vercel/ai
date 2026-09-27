---
'@ai-sdk/anthropic': patch
'@ai-sdk/gateway': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/google-vertex': patch
---

feat(anthropic): add Claude Sonnet 5.5 support

- add the `claude-sonnet-5-5` model ID to `@ai-sdk/anthropic` and `@ai-sdk/google-vertex`, `anthropic.claude-sonnet-5-5` and `us.anthropic.claude-sonnet-5-5` to `@ai-sdk/amazon-bedrock`, and `anthropic/claude-sonnet-5.5` to `@ai-sdk/gateway`
- add the `between_tools` thinking type (`thinking: { type: 'between_tools' }`), the lowest thinking setting on `claude-sonnet-5-5`; `xhigh` and `max` effort are lowered to `high` with a warning because the API rejects them with `between_tools`
- `claude-sonnet-5-5` rejects disabled thinking: `thinking: { type: 'disabled' }` is replaced with `between_tools` thinking (with a warning), and budget-based thinking is converted to adaptive thinking
- `claude-sonnet-5-5` rejects forced tool use: `required` and named tool choices fall back to `auto`, and `structuredOutputMode: 'jsonTool'` falls back to native structured outputs, each with a warning
