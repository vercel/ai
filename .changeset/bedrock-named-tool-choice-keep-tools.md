---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): keep every function tool on a named tool choice for Anthropic models

Anthropic models that accept forced tool use now receive every function tool with `toolChoice: { tool: { name } }`, as with `@ai-sdk/anthropic`, so a forced step no longer invalidates the prompt cache. Other models, and Anthropic models that reject forced tool use, still receive only the named tool. For exactly one tool call on a forced step, set `providerOptions.anthropic.disableParallelToolUse: true`.
