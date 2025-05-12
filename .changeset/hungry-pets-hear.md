---
'@ai-sdk/provider': major
---

## Message `mimeType` has been renamed to `mediaType`

Before:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analyze the following PDF and generate a summary.',
        },
        {
          type: 'file',
          data: contents,
          mimeType: 'application/pdf',
        }
      ]
    }
  ]
});
```

After:

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analyze the following PDF and generate a summary.',
        },
        {
          type: 'file',
          data: contents,
          mediaType: 'application/pdf',
        }
      ]
    }
  ]
});
```

Commit: https://github.com/vercel/ai/pull/5602
