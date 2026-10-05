---
"@ai-sdk/black-forest-labs": patch
"@ai-sdk/amazon-bedrock": patch
"@ai-sdk/anthropic-aws": patch
"@ai-sdk/google-vertex": patch
"@ai-sdk/huggingface": patch
"@ai-sdk/assemblyai": patch
"@ai-sdk/elevenlabs": patch
"@ai-sdk/fish-audio": patch
"@ai-sdk/moonshotai": patch
"@ai-sdk/perplexity": patch
"@ai-sdk/togetherai": patch
"@ai-sdk/anthropic": patch
"@ai-sdk/bytedance": patch
"@ai-sdk/deepinfra": patch
"@ai-sdk/replicate": patch
"@ai-sdk/cartesia": patch
"@ai-sdk/cerebras": patch
"@ai-sdk/deepgram": patch
"@ai-sdk/deepseek": patch
"@ai-sdk/gmicloud": patch
"@ai-sdk/provider": patch
"@ai-sdk/quiverai": patch
"@ai-sdk/alibaba": patch
"@ai-sdk/klingai": patch
"@ai-sdk/minimax": patch
"@ai-sdk/mistral": patch
"@ai-sdk/cohere": patch
"@ai-sdk/gladia": patch
"@ai-sdk/google": patch
"@ai-sdk/openai": patch
"@ai-sdk/prodia": patch
"@ai-sdk/voyage": patch
"@ai-sdk/azure": patch
"@ai-sdk/revai": patch
"@ai-sdk/topaz": patch
"@ai-sdk/groq": patch
"@ai-sdk/hume": patch
"@ai-sdk/luma": patch
"@ai-sdk/fal": patch
"@ai-sdk/xai": patch
"@ai-sdk/zai": patch
"ai": patch
---

Add automatic type inference for `providerOptions` based on the selected model. This removes the need to manually cast or annotate provider-specific options when using functions such as `generateText`, `streamText`, `generateImage`, `embed`, and other content generation functions.
