---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): normalize tool call IDs for Mistral models

Mistral models on Bedrock require tool call IDs to match exactly 9 alphanumeric characters. This fix normalizes Bedrock-generated tool call IDs when using Mistral models to prevent validation errors during multi-turn tool calling.
