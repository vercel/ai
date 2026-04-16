---
'@ai-sdk/provider': minor
'ai': minor
'@ai-sdk/openai': minor
'@ai-sdk/openai-compatible': minor
'@ai-sdk/google': minor
'@ai-sdk/google-vertex': minor
'@ai-sdk/cohere': minor
'@ai-sdk/amazon-bedrock': minor
'@ai-sdk/mistral': minor
---

Add top-level `dimensions` option to `embed()` and `embedMany()` for configuring output embedding dimensionality. Supported providers: OpenAI, OpenAI-compatible, Google, Google Vertex, Cohere, Amazon Bedrock. Providers that don't support dimensionality reduction (Mistral) throw `UnsupportedFunctionalityError` when `dimensions` is set. Provider-specific `providerOptions` take precedence over the top-level `dimensions` when both are specified.
