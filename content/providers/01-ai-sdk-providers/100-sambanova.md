---
title: SambaNova
description: Learn how to use SambaNova Cloud.
---

# SambaNova Provider

The [SambaNova Cloud](https://cloud.sambanova.ai/) provider contains language model support for the SambaNova API.

API keys can be obtained from the [SambaNova Cloud Platform](https://cloud.sambanova.ai/apis).

## Setup

The SambaNova provider is available via the `@ai-sdk/sambanova` module.
You can install it with

<Tabs items={['pnpm', 'npm', 'yarn']}>
  <Tab>
    <Snippet text="pnpm add @ai-sdk/sambanova" dark />
  </Tab>
  <Tab>
    <Snippet text="npm install @ai-sdk/sambanova" dark />
  </Tab>
  <Tab>
    <Snippet text="yarn add @ai-sdk/sambanova" dark />
  </Tab>
</Tabs>

## Provider Instance

You can import the default provider instance `sambanova` from `@ai-sdk/sambanova`:

```ts
import { sambanova } from '@ai-sdk/sambanova';
```

If you need a customized setup, you can import `createSambaNova` from `@ai-sdk/sambanova`
and create a provider instance with your settings:

```ts
import { createSambaNova } from '@ai-sdk/sambanova';

const sambanova = createSambaNova({
  // custom settings
});
```

You can use the following optional settings to customize the SambaNova provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls, e.g. to use proxy servers.
  The default prefix is `https://api.sambanova.ai/v1`.

- **apiKey** _string_

  API key that is being sent using the `Authorization` header.
  It defaults to the `SAMBANOVA_API_KEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.
  Defaults to the global `fetch` function.
  You can use it as a middleware to intercept requests,
  or to provide a custom fetch implementation for e.g. testing.

## Language Models

You can create [SambaNova models](https://docs.sambanova.ai/cloud/docs/get-started/supported-models) using a provider instance.
The first argument is the model id, e.g. `Meta-Llama-3.1-70B-Instruct`.

```ts
const model = sambanova('Meta-Llama-3.1-70B-Instruct');
```

### Reasoning Models

SambaNova exposes the thinking of `deepseek-r1-distill-llama-70b` in the generated text using the `<think>` tag.
You can use the `extractReasoningMiddleware` to extract this reasoning and expose it as a `reasoning` property on the result:

```ts
import { sambanova } from '@ai-sdk/sambanova';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';

const enhancedModel = wrapLanguageModel({
  model: sambanova('deepseek-r1-distill-llama-70b'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});
```

You can then use that enhanced model in functions like `generateText` and `streamText`.

### Example

You can use SambaNova language models to generate text with the `generateText` function:

```ts
import { sambanova } from '@ai-sdk/sambanova';
import { generateText } from 'ai';

const { text } = await generateText({
  model: sambanova('Meta-Llama-3.1-70B-Instruct'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Model Capabilities

| Model                           | Image Input         | Object Generation   | Tool Usage          | Tool Streaming      |
| ------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| `DeepSeek-R1-Distill-Llama-70B` | <Cross size={18} /> | <Cross size={18} /> | <Cross size={18} /> | <Cross size={18} /> |
| `Meta-Llama-3.1-8B-Instruct`    | <Cross size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |
| `Meta-Llama-3.1-70B-Instruct`   | <Cross size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |
| `Meta-Llama-3.1-405B-Instruct`  | <Cross size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |
| `Meta-Llama-3.2-1B-Instruct`    | <Cross size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |

<Note>
  The table above lists popular models. Please see the [SambaNova
  docs](https://docs.sambanova.ai/cloud/docs/get-started/supported-models) for a
  full list of available models. The table above lists popular models. You can
  also pass any available provider model ID as a string if needed.
</Note>
