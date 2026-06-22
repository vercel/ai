---
"@ai-sdk/siliconflow": major
---

feat: add @ai-sdk/siliconflow provider for SiliconFlow API

The new `@ai-sdk/siliconflow` package provides access to hundreds of
open-source and proprietary models (Qwen, DeepSeek, GLM, Llama, etc.)
through the SiliconFlow platform.

Includes:
- Chat completion support (non-streaming + streaming)
- Tool calling (function calling + streaming tool calls)
- JSON mode (responseFormat: { type: 'json' })
- Workflow serialization (WORKFLOW_SERIALIZE / WORKFLOW_DESERIALIZE)
- Cache token metrics (promptCacheHitTokens / promptCacheMissTokens)
- Reasoning support for models like DeepSeek-R1
