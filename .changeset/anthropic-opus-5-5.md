---
'@ai-sdk/anthropic': patch
'@ai-sdk/gateway': patch
---

feat(anthropic): add Claude Opus 5.5 support

- add the `claude-opus-5-5` model ID to `@ai-sdk/anthropic` and `anthropic/claude-opus-5.5` to `@ai-sdk/gateway`
- models that always use adaptive thinking (`claude-opus-5-5`, `claude-fable-5`, `claude-fable-5-1`) no longer receive `thinking: { type: 'disabled' }` or budget-based thinking; the provider drops the unsupported setting and emits a warning
- models that reject forced tool use (`claude-opus-5-5`, `claude-fable-5-1`) fall back to `auto` tool choice for `required` and named tool choices, and to native structured outputs when `structuredOutputMode: 'jsonTool'` is requested, each with a warning
- add the `computerToolset_20260801` computer use tool (`computer_toolset_20260801`), which is required for computer use on `claude-opus-5-5`
- use the documented `mid-conversation-output-config-2026-07-01` beta header for per-message effort
