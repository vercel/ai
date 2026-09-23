---
'@ai-sdk/provider-utils': patch
'@ai-sdk/google': patch
'@ai-sdk/openai': patch
'@ai-sdk/cohere': patch
---

Add Choice-only embedding evaluation through provider evaluationModel factories for Gemini Embedding 2, OpenAI text-embedding-3-large, and Cohere Embed v4. Include model-ID autocomplete, provider-specific task settings, normalized similarity matching, bounded criterion caching, and embedding request batching. Preserve Google embedding token usage.
