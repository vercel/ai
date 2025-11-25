---
'@ai-sdk/black-forest-labs': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/assemblyai': patch
'@ai-sdk/elevenlabs': patch
'@ai-sdk/perplexity': patch
'@ai-sdk/togetherai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/deepinfra': patch
'@ai-sdk/fireworks': patch
'@ai-sdk/replicate': patch
'@ai-sdk/cerebras': patch
'@ai-sdk/deepgram': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/provider': patch
'@ai-sdk/baseten': patch
'@ai-sdk/gateway': patch
'@ai-sdk/mistral': patch
'@ai-sdk/cohere': patch
'@ai-sdk/gladia': patch
'@ai-sdk/google': patch
'@ai-sdk/openai': patch
'@ai-sdk/vercel': patch
'@ai-sdk/azure': patch
'@ai-sdk/revai': patch
'@ai-sdk/groq': patch
'@ai-sdk/luma': patch
'@ai-sdk/fal': patch
'@ai-sdk/xai': patch
'ai': patch
---

chore(provider): remove generics from EmbeddingModelV3

Before

```ts
model.textEmbeddingModel('my-model-id')
```

After

```ts
model.embeddingModel('my-model-id')
```
