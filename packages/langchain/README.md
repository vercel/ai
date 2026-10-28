# AI SDK - LangChain Adapter

The **[AI SDK](https://ai-sdk.dev)** LangChain adapter provides seamless integration between [LangChain](https://langchain.com/) and the AI SDK, enabling you to use LangChain agents and graphs with AI SDK UI components.

## Setup

```bash
npm i ai @ai-sdk/langchain @langchain/core
```

## Usage

```ts
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { createUIMessageStreamResponse } from 'ai';

// Convert messages and stream from a LangGraph graph
const langchainMessages = await toBaseMessages(uiMessages);

const langchainStream = await graph.stream(
  { messages: langchainMessages },
  { streamMode: ['values', 'messages', 'tools'] },
);

// Convert to UI message stream response
return createUIMessageStreamResponse({
  stream: toUIMessageStream(langchainStream),
});
```

See the [LangChain Adapter documentation](https://ai-sdk.dev/providers/adapters/langchain) for more information.
