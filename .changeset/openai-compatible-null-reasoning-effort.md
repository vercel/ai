---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): send `reasoningEffort: null` as `"reasoning_effort": null`, and stop an unset `reasoningEffort` from overwriting a raw `reasoning_effort` provider option
