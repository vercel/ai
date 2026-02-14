---
'@ai-sdk/openai-compatible': patch
---

Refine OpenAI-compatible chat option handling by separating stable options from legacy normalized compatibility options.

- Keep `user` as the stable normalized chat option.
- Continue supporting `reasoningEffort`, `textVerbosity`, and `strictJsonSchema` for backwards compatibility.
- Emit deprecation warnings when legacy normalized options are used and recommend provider-native fields.
- Update provider docs to clarify the normalized compatibility layer and preferred provider-native configuration.
