---
'@ai-sdk/amazon-bedrock': major
---


## Updated Bedrock provider to use camelCase for providerOptions

Before:

```ts
import { generateText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';

const result = await generateText({
  model: bedrock('amazon.titan-tg1-large', {
    reasoning_config: /* ... */
  }),
  prompt: 'Hello, world!',
});
```

After:

```ts
import { generateText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';

const result = await generateText({
  model: bedrock('amazon.titan-tg1-large'),
  prompt: 'Hello, world!',
  providerOptions: {
    bedrock: {
      reasoningConfig: /* ... */
    },
  },
});
```

Commit: https://github.com/vercel/ai/pull/5666
