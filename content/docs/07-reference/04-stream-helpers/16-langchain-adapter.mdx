---
title: '@ai-sdk/langchain Adapter'
description: API Reference for the LangChain Adapter.
---

# `@ai-sdk/langchain`

The `@ai-sdk/langchain` module provides helper functions to transform LangChain output streams into data streams and data stream responses.
See the [LangChain Adapter documentation](/providers/adapters/langchain) for more information.

It supports:

- LangChain StringOutputParser streams
- LangChain AIMessageChunk streams
- LangChain StreamEvents v2 streams

## Import

<Snippet
  text={`import { toDataStreamResponse } from "@ai-sdk/langchain"`}
  prompt={false}
/>

## API Signature

### Methods

<PropertiesTable
  content={[
    {
      name: 'toDataStream',
      type: '(stream: ReadableStream<LangChainAIMessageChunk> | ReadableStream<string>, AIStreamCallbacksAndOptions) => AIStream',
      description: 'Converts LangChain output streams to data stream.',
    },
    {
      name: 'toDataStreamResponse',
      type: '(stream: ReadableStream<LangChainAIMessageChunk> | ReadableStream<string>, options?: {init?: ResponseInit, data?: StreamData, callbacks?: AIStreamCallbacksAndOptions}) => Response',
      description: 'Converts LangChain output streams to data stream response.',
    },
    {
      name: 'mergeIntoDataStream',
      type: '(stream: ReadableStream<LangChainStreamEvent> | ReadableStream<LangChainAIMessageChunk> | ReadableStream<string>, options: { dataStream: DataStreamWriter; callbacks?: StreamCallbacks }) => void',
      description:
        'Merges LangChain output streams into an existing data stream.',
    },
  ]}
/>

## Examples

### Convert LangChain Expression Language Stream

```tsx filename="app/api/completion/route.ts" highlight={"13"}
import { toUIMessageStream } from '@ai-sdk/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createUIMessageStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const model = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  });

  const stream = await model.stream(prompt);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
```

### Convert StringOutputParser Stream

```tsx filename="app/api/completion/route.ts" highlight={"16"}
import { toUIMessageStream } from '@ai-sdk/langchain';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import { createUIMessageStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const model = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  });

  const parser = new StringOutputParser();

  const stream = await model.pipe(parser).stream(prompt);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
```
