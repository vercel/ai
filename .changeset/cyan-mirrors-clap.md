---
'@ai-sdk/openai': patch
---

feat(provider/openai): `OpenAILanguageModelOptions` type

```ts
import { openai, type OpenAILanguageModelOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';

await generateText({
  model: openai('gpt-3.5-turbo'),
  prompt: 'Invent a new holiday and describe its traditions.',
  providerOptions: {
    openai: {
      user: 'user-123',
    } satisfies OpenAILanguageModelOptions,
  },
});
```
