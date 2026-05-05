---
'@ai-sdk/alibaba': minor
---

Add embedding model support to `@ai-sdk/alibaba`. The new `AlibabaEmbeddingModel` supports Alibaba DashScope's OpenAI-compatible `/v1/embeddings` endpoint with models `text-embedding-v4` and `text-embedding-v3`. Provider-specific options (`dimensions`, `text_type`, `output_type`) are available via `providerOptions.alibaba`.
