---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): keep every function tool on a named tool choice for Anthropic models

Anthropic models that accept forced tool use now receive every function tool together with `toolChoice: { tool: { name } }`, as with `@ai-sdk/anthropic`. Bedrock already guarantees that these models call the named tool, and sending the same tool definitions on every step keeps the prompt cache valid. Other models, and Anthropic models that reject forced tool use, still receive only the named tool. To get exactly one tool call on a forced step, set `providerOptions.anthropic.disableParallelToolUse: true`.
