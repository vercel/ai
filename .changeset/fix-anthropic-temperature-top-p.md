---
'@ai-sdk/anthropic': patch
---

fix(anthropic): move claude-haiku-4-5 to the 4-5 model group in getModelCapabilities

Moves `claude-haiku-4-5` from the `claude-sonnet-4-`/`claude-3-7-sonnet` group (structured output: false) to the `claude-sonnet-4-5`/`claude-opus-4-5` group (structured output: true), aligning with main and release-v6.0.
