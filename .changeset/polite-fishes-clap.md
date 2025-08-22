---
'@ai-sdk/mistral': patch
---

feat(provider/mistral): `MistralLanguageModelOptions` type

```ts
import { mistral, type MistralLanguageModelOptions } from '@ai-sdk/mistral';
import { generateText } from 'ai';

await generateText({
  model: mistral('open-mistral-7b'),
  prompt: 'Invent a new holiday and describe its traditions.',
  providerOptions: {
    mistral: {
      safePrompt: true,
      documentImageLimit: 5,
      documentPageLimit: 10,
    } satisfies MistralLanguageModelOptions,
  },
});
```
