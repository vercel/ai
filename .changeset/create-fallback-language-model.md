---
"ai": minor
---

feat(ai): add `createFallbackLanguageModel`

Adds a new public `createFallbackLanguageModel({ models, shouldRetry?, modelId?, providerId? })` helper that wraps a chain of `LanguageModel`s into a single `LanguageModelV4`. Calls are attempted against the models in order; if a call throws and the optional `shouldRetry(error, modelIndex)` predicate returns true (default: always), the next model is tried. If all models fail, the last error is re-thrown.

```ts
import { createFallbackLanguageModel, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

const resilient = createFallbackLanguageModel({
  models: [openai('gpt-5-mini'), anthropic('claude-3-5-haiku-latest')],
  shouldRetry: error => /rate|overloaded|503/.test(String(error)),
});

await generateText({ model: resilient, prompt: '…' });
```

Streaming semantics: fallback is only attempted while the underlying `doStream` *promise* is still pending. Once the stream has started emitting parts, mid-stream errors are forwarded untouched — falling back mid-stream would force callers to stitch partial output from one provider onto output from another.

Closes #2636.
