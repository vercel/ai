---
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
---

Refactor Amazon Bedrock model ID logic into a model catalog that declares capabilities and provider options, and generate provider capability documentation from it. Export the Anthropic catalog capability helper under its compatibility name for Bedrock to reuse. Request behavior is unchanged.
