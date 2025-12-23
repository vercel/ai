# AI SDK - LangChain Adapter

The **[AI SDK](https://ai-sdk.dev)** LangChain adapter provides seamless integration between [LangChain](https://langchain.com/) and the AI SDK, enabling you to use LangChain agents and graphs with AI SDK UI components.

## Installation

```bash
npm install @ai-sdk/langchain @langchain/core
```

> **Note:** `@langchain/core` is a required peer dependency.

## Features

- Convert AI SDK `UIMessage` to LangChain `BaseMessage` format
- Transform LangChain/LangGraph streams to AI SDK `UIMessageStream`
- `ChatTransport` implementation for LangSmith deployments
- Full support for text, tool calls, and tool results
- Custom data streaming with typed events (`data-{type}`)

## Usage

### Converting Messages

Use `toBaseMessages` to convert AI SDK messages to LangChain format:

```ts
import { toBaseMessages } from '@ai-sdk/langchain';

// Convert UI messages to LangChain format
const langchainMessages = await toBaseMessages(uiMessages);

// Use with any LangChain model
const response = await model.invoke(langchainMessages);
```

### Streaming from LangGraph

Use `toUIMessageStream` to convert LangGraph streams to AI SDK format:

```ts
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { createUIMessageStreamResponse } from 'ai';

// Convert messages and stream from a LangGraph graph
const langchainMessages = await toBaseMessages(uiMessages);

const langchainStream = await graph.stream(
  { messages: langchainMessages },
  { streamMode: ['values', 'messages'] },
);

// Convert to UI message stream response
return createUIMessageStreamResponse({
  stream: toUIMessageStream(langchainStream),
});
```

### Custom Data Streaming

LangChain tools can emit custom data events using `config.writer()`. The adapter converts these to typed `data-{type}` parts:

```ts
import { tool, type ToolRuntime } from 'langchain';

const analyzeDataTool = tool(
  async ({ query }, config: ToolRuntime) => {
    // Emit progress updates - becomes 'data-progress' in the UI
    config.writer?.({
      type: 'progress',
      id: 'analysis-1', // Include 'id' to persist in message.parts
      step: 'fetching',
      message: 'Fetching data...',
      progress: 50,
    });

    // ... perform analysis ...

    // Emit status update - becomes 'data-status' in the UI
    config.writer?.({
      type: 'status',
      id: 'analysis-1-status',
      status: 'complete',
      message: 'Analysis finished',
    });

    return 'Analysis complete';
  },
  {
    name: 'analyze_data',
    description: 'Analyze data with progress updates',
    schema: z.object({ query: z.string() }),
  },
);
```

Enable the `custom` stream mode to receive these events:

```ts
const stream = await graph.stream(
  { messages: langchainMessages },
  { streamMode: ['values', 'messages', 'custom'] },
);
```

**Custom data behavior:**

- Data with an `id` field is **persistent** (added to `message.parts` for rendering)
- Data without an `id` is **transient** (only delivered via the `onData` callback)
- The `type` field determines the event name: `{ type: 'progress' }` → `data-progress`

### LangSmith Deployment Transport

Use `LangSmithDeploymentTransport` with the AI SDK `useChat` hook to connect directly to a LangGraph deployment from the browser:

```tsx
import { useChat } from 'ai/react';
import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';
import { useMemo } from 'react';

function Chat() {
  const transport = useMemo(
    () =>
      new LangSmithDeploymentTransport({
        url: 'https://your-deployment.us.langgraph.app',
        apiKey: process.env.LANGSMITH_API_KEY,
      }),
    [],
  );

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    transport,
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.parts.map(part => part.text).join('')}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## API Reference

### `toBaseMessages(messages)`

Converts AI SDK `UIMessage` objects to LangChain `BaseMessage` objects.

**Parameters:**

- `messages`: `UIMessage[]` - Array of AI SDK UI messages

**Returns:** `Promise<BaseMessage[]>`

### `convertModelMessages(modelMessages)`

Converts AI SDK `ModelMessage` objects to LangChain `BaseMessage` objects.

**Parameters:**

- `modelMessages`: `ModelMessage[]` - Array of model messages

**Returns:** `BaseMessage[]`

### `toUIMessageStream(stream)`

Converts a LangChain/LangGraph stream to an AI SDK `UIMessageStream`.

**Parameters:**

- `stream`: `ReadableStream` - LangGraph stream with `streamMode: ['values', 'messages']`

**Returns:** `ReadableStream<UIMessageChunk>`

**Supported stream events:**

- `messages` - Streaming message chunks (text, tool calls)
- `values` - State updates that finalize pending message chunks
- `custom` - Custom data events (emitted as `data-{type}` chunks)

### `LangSmithDeploymentTransport`

A `ChatTransport` implementation for LangSmith/LangGraph deployments.

**Constructor Parameters:**

- `options`: `LangSmithDeploymentTransportOptions` - Configuration for the RemoteGraph connection
  - `url`: `string` - LangSmith deployment URL or local server URL
  - `apiKey?`: `string` - API key for authentication (optional for local development)
  - `graphId?`: `string` - The ID of the graph to connect to (defaults to `'agent'`)

**Implements:** `ChatTransport`

## Documentation

Please check out the [AI SDK documentation](https://ai-sdk.dev) for more information.
