---
'@ai-sdk/amazon-bedrock': patch
---

Default to disabling parallel tool use for named Anthropic tool choices on models that support forced tools. Preserve the complete function tool catalog and prompt cache compatibility. An explicit `providerOptions.anthropic.disableParallelToolUse: false` keeps parallel calls enabled.
