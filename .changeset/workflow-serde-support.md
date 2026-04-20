---
'@ai-sdk/provider-utils': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/openai': patch
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/groq': patch
'@ai-sdk/mistral': patch
'@ai-sdk/cohere': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/deepinfra': patch
'@ai-sdk/perplexity': patch
'@ai-sdk/xai': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/gateway': patch
'@ai-sdk/prodia': patch
'@ai-sdk/fal': patch
'@ai-sdk/luma': patch
'@ai-sdk/replicate': patch
'@ai-sdk/fireworks': patch
'@ai-sdk/togetherai': patch
'@ai-sdk/black-forest-labs': patch
'@ai-sdk/deepgram': patch
'@ai-sdk/elevenlabs': patch
'@ai-sdk/hume': patch
'@ai-sdk/lmnt': patch
'@ai-sdk/assemblyai': patch
'@ai-sdk/gladia': patch
'@ai-sdk/revai': patch
---

Add workflow serialization support to all provider models.

**`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

**All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.
