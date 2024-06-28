# Vercel AI SDK

The Vercel AI SDK is a TypeScript library designed to help you build AI-powered applications with React, Next.js, Vue, Svelte, Node.js, and more.

To learn more about how to use the Vercel AI SDK, check out our [API Reference](https://sdk.vercel.ai/docs/reference) and [Documentation](https://sdk.vercel.ai/docs).

## Installation

```shell
pnpm install ai
```

## Usage

### AI SDK Core

The AI SDK Core module provides a unified API to interact with model providers like [OpenAI](https://sdk.vercel.ai/providers/ai-sdk-providers/openai), [Anthropic](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic), [Google](https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai), etc. The Core module runs on

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Ensure OPENAI_API_KEY is set

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

The AI SDK UI module provides a set of hooks that help you build chatbots and generative user interfaces. These hooks are framework agnostic, so they can be used in Next.js, React, Svelte, Vue, and SolidJS.

```tsx
"use client"

export function Chat() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } = useChat()

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <div>{message.role}</div>
          <div>{message.content}</div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          placeholder="Send a message..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </form>
    </div>
  )
}
```

### AI SDK RSC

The AI SDK RSC module provides an alternative API that also helps you build chatbots and generative user interfaces for frameworks that support [React Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components).

This API leverages the benefits of [streaming](https://nextjs.org/docs/app/building-your-application/rendering/server-components#streaming) and [server actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) offered by React Server Components, thus improving the developer experience of managing states between server/client and building generative user interfaces.

###### @/app/actions.tsx (Next.js)

```tsx
async function submitMessage() {
  'use server';

  const stream = streamUI({
    model: openai('gpt-4-turbo'),
    text: ({}) => {},
    tools: {},
  });

  return {
    ui: stream.value,
  };
}

const AI = createAI({
  initialAIState: {},
  initialUIState: {},
  actions: {
    submitMessage,
  },
});
```

###### @/app/layout.tsx (Next.js)

```tsx
import { ReactNode } from 'react';
import { AI } from '@/app/actions';

export default function Layout({ children }: { children: ReactNode }) {
  <AI>{children}</AI>;
}
```

###### @/app/page.tsx (Next.js)

```tsx
import { useActions } from 'ai/rsc';

export default function Page() {
  const { submitMessage } = useActions();

  return <div>...</div>;
}
```

## Community

The Vercel AI SDK community can be found on [GitHub Discussions](https://github.com/vercel/ai/discussions) where you can ask questions, voice ideas, and share your projects with other people.

## Contributing

Contributions to the Vercel AI SDK are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](https://github.com/vercel/ai/blob/main/CONTRIBUTING.md) to make sure you have smooth experience contributing to Vercel AI SDK.

## Authors

This library is created by [Vercel](https://vercel.com) and [Next.js](https://nextjs.org) team members, with contributions from:

- Jared Palmer ([@jaredpalmer](https://twitter.com/jaredpalmer)) - [Vercel](https://vercel.com)
- Shu Ding ([@shuding\_](https://twitter.com/shuding_)) - [Vercel](https://vercel.com)
- Max Leiter ([@max_leiter](https://twitter.com/max_leiter)) - [Vercel](https://vercel.com)
- Malte Ubl ([@cramforce](https://twitter.com/cramforce)) - [Vercel](https://vercel.com)
- Lars Grammel ([@lgrammel](https://twitter.com/lgrammel)) - [Vercel](https://vercel.com)
