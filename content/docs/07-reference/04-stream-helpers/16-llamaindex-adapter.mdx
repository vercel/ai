---
title: '@ai-sdk/llamaindex Adapter'
description: API Reference for the LlamaIndex Adapter.
---

# `@ai-sdk/llamaindex`

The `@ai-sdk/llamaindex` package provides helper functions to transform LlamaIndex output streams into data streams and data stream responses.
See the [LlamaIndex Adapter documentation](/providers/adapters/llamaindex) for more information.

It supports:

- LlamaIndex ChatEngine streams
- LlamaIndex QueryEngine streams

## Import

<Snippet
  text={`import { toDataResponse } from "@ai-sdk/llamaindex"`}
  prompt={false}
/>

## API Signature

### Methods

<PropertiesTable
  content={[
    {
      name: 'toDataStream',
      type: '(stream: AsyncIterable<EngineResponse>, AIStreamCallbacksAndOptions) => AIStream',
      description: 'Converts LlamaIndex output streams to data stream.',
    },
    {
      name: 'toDataStreamResponse',
      type: '(stream: AsyncIterable<EngineResponse>, options?: {init?: ResponseInit, data?: StreamData, callbacks?: AIStreamCallbacksAndOptions}) => Response',
      description:
        'Converts LlamaIndex output streams to data stream response.',
    },
    {
      name: 'mergeIntoDataStream',
      type: '(stream: AsyncIterable<EngineResponse>, options: { dataStream: DataStreamWriter; callbacks?: StreamCallbacks }) => void',
      description:
        'Merges LlamaIndex output streams into an existing data stream.',
    },
  ]}
/>

## Examples

### Convert LlamaIndex ChatEngine Stream

```tsx filename="app/api/completion/route.ts" highlight="15"
import { OpenAI, SimpleChatEngine } from 'llamaindex';
import { toDataStreamResponse } from '@ai-sdk/llamaindex';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const llm = new OpenAI({ model: 'gpt-4o' });
  const chatEngine = new SimpleChatEngine({ llm });

  const stream = await chatEngine.chat({
    message: prompt,
    stream: true,
  });

  return toDataStreamResponse(stream);
}
```
