---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): keep every function tool on a named tool choice for Anthropic models

Anthropic models that accept forced tool use now receive every function tool on a named tool choice, as with `@ai-sdk/anthropic`, so a forced step no longer invalidates the prompt cache. Parallel tool use is disabled on that step by default, so the model still calls only the named tool. Set `providerOptions.anthropic.disableParallelToolUse: false` to allow parallel calls. Other models, and Anthropic models that reject forced tool use, still receive only the named tool.
