---
'@ai-sdk/provider': patch
'ai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/openai': patch
---

Add top-level `reasoning` parameter to language model call settings.

The `reasoning` field allows configuring the reasoning/thinking effort level
directly on `generateText`, `streamText`, `generateObject`, and `streamObject`
without needing to use provider-specific `providerOptions`.

```typescript
const result = await generateText({
  model: openai('o4-mini'),
  reasoning: { effort: 'high' },
  prompt: 'Solve this complex problem...',
});
```

Supported effort levels: `'none'` | `'low'` | `'medium'` | `'high'`.
When not set, the provider default behavior is used.

Provider mappings:

- **OpenAI**: Maps `effort` to `reasoning_effort` (provider-specific `reasoningEffort` takes precedence)
- **Anthropic**: Maps `effort` to `output_config.effort`; `'none'` disables thinking (provider-specific `thinking` or `effort` options take precedence)
