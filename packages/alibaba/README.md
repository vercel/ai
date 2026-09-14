# AI SDK - Alibaba Provider

The **[Alibaba provider](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model, embedding model, and video model support for [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/), including the Qwen model series with advanced reasoning capabilities.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Alibaba (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

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

## Preserved Thinking Example (Multi-Turn Reasoning)

For models that support preserved thinking, the AI SDK sends reasoning from
previous assistant messages back as Alibaba `reasoning_content` by default
(`preserve_thinking`), so the model can build on its earlier thought process:

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';

const providerOptions = {
  alibaba: {
    enableThinking: true,
    thinkingBudget: 2048,
  },
};

const opening = {
  role: 'user' as const,
  content: 'Is Kafka or RocketMQ a better fit for transactional messages?',
};

const first = await generateText({
  model: alibaba('qwen3.7-max'),
  messages: [opening],
  providerOptions,
});

const second = await generateText({
  model: alibaba('qwen3.7-max'),
  messages: [
    opening,
    ...first.responseMessages, // append unchanged to keep the reasoning parts
    { role: 'user', content: 'Which tradeoff mattered most?' },
  ],
  providerOptions,
});
```

When continuing the conversation, append `responseMessages` unchanged so the
reasoning parts survive to be serialized as `reasoning_content`. Set the
`preserveThinking` provider option to `false` to opt out. Keep in mind:

- `preserveThinking` does not enable thinking by itself.
- It is enabled by default only for models that Alibaba documents as supporting
  preserved thinking; for other models the option is not sent unless you set it
  explicitly. See Alibaba's
  [preserved-thinking documentation](https://docs.qwencloud.com/developer-guides/text-generation/thinking#preserve-thinking-in-multi-turn).
- Reasoning from the current tool-call round is always sent back with tool
  results, as Alibaba recommends.
- Preserved reasoning increases input token usage and billing.
- Historical reasoning remains separate from visible assistant text; it is never
  merged into `content`.

## Embedding Model Example

```ts
import { alibaba, type AlibabaEmbeddingModelOptions } from '@ai-sdk/alibaba';
import { embed } from 'ai';

const { embedding, usage } = await embed({
  model: alibaba.embedding('text-embedding-v4'),
  value: 'sunny day at the beach',
  providerOptions: {
    alibaba: {
      textType: 'document',
      dimension: 1024,
      outputType: 'dense',
    } satisfies AlibabaEmbeddingModelOptions,
  },
});
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
      inputSchema: z.object({
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

const longDocument = '... large document content ...';

const { text, usage } = await generateText({
  model: alibaba('qwen-plus'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Context: Please analyze this document.',
        },
        {
          type: 'text',
          text: longDocument,
          providerOptions: {
            alibaba: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      ],
    },
  ],
});
```

**Note:** The minimum content length for a cache block is 1,024 tokens.

## Documentation

Please check out the **[Alibaba provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba)** for more information.
