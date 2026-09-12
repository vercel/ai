# AI SDK - Nebul Provider

The **Nebul provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Nebul](https://nebul.io), offering sovereign GPU inference for open-weight models over an OpenAI-compatible API.

## Setup

The Nebul provider is available in the `@ai-sdk/nebul` module. You can install it with:

```bash
npm i @ai-sdk/nebul
```

## Provider Instance

You can import the default provider instance `nebul` from `@ai-sdk/nebul`:

```ts
import { nebul } from '@ai-sdk/nebul';
```

The Nebul API key is read from the `NEBUL_API_KEY` environment variable by default. For custom configuration, use `createNebul`:

```ts
import { createNebul } from '@ai-sdk/nebul';

const nebul = createNebul({
  apiKey: process.env.NEBUL_API_KEY ?? '',
});
```

## Language Models

```ts
import { nebul } from '@ai-sdk/nebul';
import { generateText } from 'ai';

const { text } = await generateText({
  model: nebul('mistralai/Mistral-7B-Instruct-v0.3'),
  prompt: 'What is the capital of France?',
});
```

Nebul serves an evolving catalog of open-weight models over chat completions, so model ids are typed as `string`. Embedding and image models are not supported.
