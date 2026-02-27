---
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/provider': patch
'@ai-sdk/google': patch
'@ai-sdk/openai': patch
'ai': patch
---

feat(ai): Add countTokens function for token estimation

Added a new `countTokens` function to the `ai` package that allows counting input tokens before making a generation call. This helps with cost estimation and staying within context window limits.

- Added optional `doCountTokens` method to the `LanguageModelV3` interface
- Anthropic, Google (Gemini/Vertex), and Amazon Bedrock use native API endpoints for exact token counts
- OpenAI and Azure use local tiktoken estimation (flagged via `providerMetadata.openai.estimatedTokenCount`)
- Providers without `doCountTokens` throw `UnsupportedFunctionalityError`
