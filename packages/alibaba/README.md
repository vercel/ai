# AI SDK - Alibaba Provider

The **[Alibaba provider](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/), including the Qwen model series with advanced reasoning capabilities.

## Setup

The Alibaba provider is available in the `@ai-sdk/alibaba` module. You can install it with

```bash
npm i @ai-sdk/alibaba
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `alibaba` from `@ai-sdk/alibaba`:

```ts
import { alibaba } from '@ai-sdk/alibaba';
```

## Language Model Example

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';

const { text } = await generateText({
  model: alibaba('qwen-plus'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Thinking Mode Example (Qwen Reasoning Models)

Alibaba's Qwen models support thinking/reasoning mode for complex problem-solving:

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';

const { text, reasoningText } = await generateText({
  model: alibaba('qwen3-max'),
  providerOptions: {
    alibaba: {
      enableThinking: true,
      thinkingBudget: 2048,
    },
  },
  prompt: 'How many "r"s are in the word "strawberry"?',
});

console.log('Reasoning:', reasoningText);
console.log('Answer:', text);
```

## Tool Calling Example

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const { text } = await generateText({
  model: alibaba('qwen-plus'),
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      parameters: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    }),
  },
  prompt: 'What is the weather in San Francisco?',
});
```

## Explicit Caching Example

Alibaba supports both implicit and explicit prompt caching to reduce costs for repeated prompts.

**Implicit caching** works automatically - the provider caches appropriate content without any configuration. For more control, you can use **explicit caching** by marking specific messages with `cacheControl`:

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';

const { text, usage } = await generateText({
  model: alibaba('qwen-plus'),
  messages: [
    {
      role: 'system',
      content: 'You are a helpful assistant. [... long system prompt ...]',
      providerMetadata: {
        alibaba: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    },
    {
      role: 'user',
      content: 'What is the capital of France?',
    },
  ],
});
```

## Documentation

Please check out the **[Alibaba provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba)** for more information.
