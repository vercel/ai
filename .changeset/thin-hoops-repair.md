---
"@ai-sdk/amazon-bedrock": patch
---

fix (provider/amazon-bedrock): transform stream exception events into the Anthropic error event shape so they no longer fail the stream chunk schema as `AI_TypeValidationError` and instead surface the Bedrock error message
