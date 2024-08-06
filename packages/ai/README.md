![hero illustration](./assets/hero.gif)

# Vercel AI SDK

The [Vercel AI SDK](https://sdk.vercel.ai/docs) is a TypeScript toolkit designed to help you build AI-powered applications using popular frameworks like Next.js, React, Svelte, Vue and runtimes like Node.js.

To learn more about how to use the Vercel AI SDK, check out our [API Reference](https://sdk.vercel.ai/docs/reference) and [Documentation](https://sdk.vercel.ai/docs).

## Installation

You will need Node.js 18+ and pnpm installed on your local development machine.

```shell
npm install ai
```

## Usage

### AI SDK Core

The [AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core/overview) module provides a unified API to interact with model providers like [OpenAI](https://sdk.vercel.ai/providers/ai-sdk-providers/openai), [Anthropic](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic), [Google](https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai), and more.

You will then install the model provider of your choice.

```shell
npm install @ai-sdk/openai
```

###### @/index.ts (Node.js Runtime)

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Ensure OPENAI_API_KEY environment variable is set

async function main() {
  const { text } = await generateText({
    model: openai('gpt-4-turbo'),
    system: 'You are a friendly assistant!',
    prompt: 'Why is the sky blue?',
  });

  console.log(text);
}

main();
```

### AI SDK UI

The [AI SDK UI](https://sdk.vercel.ai/docs/ai-sdk-ui/overview) module provides a set of hooks that help you build chatbots and generative user interfaces. These hooks are framework agnostic, so they can be used in Next.js, React, Svelte, Vue, and SolidJS.

###### @/app/page.tsx (Next.js App Router)

```tsx
'use client';

import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat();

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <div>{message.role}</div>
          <div>{message.content}</div>
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          placeholder="Send a message..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
```

###### @/app/api/chat/route.ts (Next.js App Router)

```ts
import { CoreMessage, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages }: { messages: CoreMessage[] } = await req.json();

  const result = await streamText({
    model: openai('gpt-4'),
    system: 'You are a helpful assistant.',
    messages,
  });

  return result.toDataStreamResponse();
}
```

### AI SDK RSC

The [AI SDK RSC](https://sdk.vercel.ai/docs/ai-sdk-rsc/overview) module provides an alternative API that also helps you build chatbots and generative user interfaces for frameworks that support [React Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components) (RSC).

This API leverages the benefits of [Streaming](https://nextjs.org/docs/app/building-your-application/rendering/server-components#streaming) and [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) offered by RSC, thus improving the developer experience of managing states between server/client and building generative user interfaces.

###### @/app/actions.tsx (Next.js App Router)

```tsx
import { streamUI } from 'ai/rsc';
import { z } from 'zod';

async function submitMessage() {
  'use server';

  const stream = await streamUI({
    model: openai('gpt-4-turbo'),
    messages: [
      { role: 'system', content: 'You are a friendly bot!' },
      { role: 'user', content: input },
    ],
    text: ({ content, done }) => {
      return <div>{content}</div>;
    },
    tools: {
      deploy: {
        description: 'Deploy repository to vercel',
        parameters: z.object({
          repositoryName: z
            .string()
            .describe('The name of the repository, example: vercel/ai-chatbot'),
        }),
        generate: async function* ({ repositoryName }) {
          yield <div>Cloning repository {repositoryName}...</div>;
          await new Promise(resolve => setTimeout(resolve, 3000));
          yield <div>Building repository {repositoryName}...</div>;
          await new Promise(resolve => setTimeout(resolve, 2000));
          return <div>{repositoryName} deployed!</div>;
        },
      },
    },
  });

  return {
    ui: stream.value,
  };
}

export const AI = createAI({
  initialAIState: {},
  initialUIState: {},
  actions: {
    submitMessage,
  },
});
```

###### @/app/layout.tsx (Next.js App Router)

```tsx
import { ReactNode } from 'react';
import { AI } from '@/app/actions';

export default function Layout({ children }: { children: ReactNode }) {
  <AI>{children}</AI>;
}
```

###### @/app/page.tsx (Next.js App Router)

```tsx
'use client';

import { useActions } from 'ai/rsc';
import { ReactNode, useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ReactNode[]>([]);
  const { submitMessage } = useActions();

  return (
    <div>
      <input
        value={input}
        onChange={event => {
          setInput(event.target.value);
        }}
      />
      <button
        onClick={async () => {
          const { ui } = await submitMessage(input);
          setMessages(currentMessages => [...currentMessages, ui]);
        }}
      >
        Submit
      </button>
    </div>
  );
}
```

## Templates

We've built [templates](https://vercel.com/templates?type=ai) that include AI SDK integrations for different use cases, providers, and frameworks. You can use these templates to get started with your AI-powered application.

## Community

The Vercel AI SDK community can be found on [GitHub Discussions](https://github.com/vercel/ai/discussions) where you can ask questions, voice ideas, and share your projects with other people.

## Contributing

Contributions to the Vercel AI SDK are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](https://github.com/vercel/ai/blob/main/CONTRIBUTING.md) to make sure you have smooth experience contributing to Vercel AI SDK.

## Authors

This library is created by [Vercel](https://vercel.com) and [Next.js](https://nextjs.org) team members, with contributions from the [Open Source Community](https://github.com/vercel/ai/graphs/contributors).
