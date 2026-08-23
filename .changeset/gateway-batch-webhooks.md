---
'@ai-sdk/anthropic': patch
'@ai-sdk/gateway': patch
'@ai-sdk/openai': patch
'@ai-sdk/provider': patch
'ai': patch
---

feat: add batch completion webhooks. `experimental_startTextBatch` accepts a `webhookUrl`, and the gateway provider registers it through the batch `callbackUrl` contract. Direct Anthropic and OpenAI batch providers return an unsupported warning when the option is provided.
