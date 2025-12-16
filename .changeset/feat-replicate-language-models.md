---
'@ai-sdk/replicate': patch
---

feat(replicate): add language model support

Adds language model support to the Replicate provider, enabling text generation with popular models like:
- Meta Llama 3.x models (8B, 70B, 405B)
- Mistral models
- DeepSeek R1 and V3.1
- Qwen 2.5 models
- and many more

This change adds:
- `ReplicateLanguageModel` class implementing `LanguageModelV3`
- Support for standard parameters (temperature, topP, topK, maxOutputTokens, etc.)
- Non-streaming text generation via the Replicate predictions API
- Basic streaming support (experimental)
- Updated documentation with language model usage examples

Example usage:
```ts
import { replicate } from '@ai-sdk/replicate';
import { generateText } from 'ai';

const { text } = await generateText({
  model: replicate.languageModel('meta/meta-llama-3.1-405b-instruct'),
  prompt: 'Write a haiku about programming',
});
```
