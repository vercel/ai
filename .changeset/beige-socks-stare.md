---
'ai': major
---

## The `generateText` steps return field `.reasoning` has been renamed to `.reasoningText`

Before:

```ts
import { generateText } from 'ai';
import { xai } from '@ai-sdk/xai';

const { steps, response } = await generateText({
  model: xai('grok-3'),
  providerOptions: {
    xai: {
      reasoningEffort: 'high',
    },
  },
});

for (const step of steps) {
  if (step.reasoning) {
    console.log(step.reasoning);
  }
}
```

After:

```ts
import { generateText } from 'ai';
import { xai } from '@ai-sdk/xai';

const { steps, response } = await generateText({
  model: xai('grok-3'),
  providerOptions: {
    xai: {
      reasoningEffort: 'high',
    },
  },
});

for (const step of steps) {
  if (step.reasoningText) {
    console.log(step.reasoningText);
  }
}
```

Commit: https://github.com/vercel/ai/pull/5803
