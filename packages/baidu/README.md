# AI SDK - Baidu Provider

The **[Baidu provider](https://ai-sdk.dev/providers/ai-sdk-providers/baidu)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for Baidu Qianfan's OpenAI-compatible chat completions API.

## Setup

The Baidu provider is available in the `@ai-sdk/baidu` module. You can install it with

```bash
npm i @ai-sdk/baidu
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `baidu` from `@ai-sdk/baidu`:

```ts
import { baidu } from '@ai-sdk/baidu';
```

For custom configuration, you can import `createBaidu` and create a provider instance with your settings:

```ts
import { createBaidu } from '@ai-sdk/baidu';

const baidu = createBaidu({
  apiKey: process.env.BAIDU_API_KEY ?? '',
});
```

You can use the following optional settings to customize the Baidu provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls, e.g. to use a proxy server.
  The default prefix is `https://qianfan.baidubce.com/v2`.

- **apiKey** _string_

  API key that is being sent using the `Authorization` header. It defaults to
  the `BAIDU_API_KEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.

- **includeUsage** _boolean_

  Include usage information in streaming responses. When enabled, token usage will be included in the final chunk.
  Defaults to `true`.

## Language Model Example

```ts
import { baidu } from '@ai-sdk/baidu';
import { generateText } from 'ai';

const { text } = await generateText({
  model: baidu('ernie-4.5-turbo-128k'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

You can also use the `.chatModel()` or `.languageModel()` factory methods:

```ts
const model = baidu.chatModel('ernie-4.5-turbo-128k');
// or
const model = baidu.languageModel('ernie-4.5-turbo-128k');
```

## Tool Calling Example

```ts
import { baidu } from '@ai-sdk/baidu';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const { text } = await generateText({
  model: baidu('ernie-4.5-turbo-128k'),
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      parameters: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
      }),
    }),
  },
  prompt: 'What is the weather in Beijing?',
});
```

## Image Input Example

```ts
import { baidu } from '@ai-sdk/baidu';
import { generateText } from 'ai';

const { text } = await generateText({
  model: baidu('ernie-4.5-turbo-vl-32k'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image.' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: '...',
        },
      ],
    },
  ],
});
```

Baidu language models can be used in the `streamText` function
(see [AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core)).

Model IDs are passed through to Baidu Qianfan's OpenAI-compatible chat API. You can also pass any available provider model ID as a string if needed.

## Documentation

Please check out the **[Baidu provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/baidu)** for more information.
