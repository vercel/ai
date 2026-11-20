# AI SDK - LlamaIndex Adapter

This package contains a LlamaIndex adapter for the AI SDK.

## Setup

```bash
npm i ai @ai-sdk/llamaindex llamaindex
```

## Usage

```tsx
import { OpenAI, SimpleChatEngine } from 'llamaindex';
import { toUIMessageStream } from '@ai-sdk/llamaindex';
import { createUIMessageStreamResponse } from 'ai';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const llm = new OpenAI({ model: 'gpt-6-astra' });
  const chatEngine = new SimpleChatEngine({ llm });

  const stream = await chatEngine.chat({
    message: prompt,
    stream: true,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
```

See the [LlamaIndex documentation](https://ai-sdk.dev/providers/adapters/llamaindex) for more information.
