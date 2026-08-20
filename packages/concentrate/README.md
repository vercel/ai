# AI SDK - Concentrate AI Provider

The **Concentrate AI provider** for the [AI SDK](https://ai-sdk.dev/docs) provides access to Concentrate's unified model API.

## Setup

```bash
pnpm add @ai-sdk/concentrate
```

The default provider instance uses the `CONCENTRATE_API_KEY` environment variable:

```ts
import { concentrate } from '@ai-sdk/concentrate';
```

For custom configuration:

```ts
import { createConcentrate } from '@ai-sdk/concentrate';

const concentrate = createConcentrate({
  apiKey: process.env.CONCENTRATE_API_KEY,
});
```

## Language Models

The default model uses Concentrate's Responses API:

```ts
import { concentrate } from '@ai-sdk/concentrate';
import { generateText } from 'ai';

const { text } = await generateText({
  model: concentrate('glm-4.7-flash'),
  prompt: 'What is the capital of France?',
});
```

Use Chat Completions explicitly when needed:

```ts
const result = await generateText({
  model: concentrate.chat('glm-4.7-flash'),
  prompt: 'What is the capital of France?',
});
```

Concentrate model IDs are strings because its catalog is evolving. Embedding and image models are not supported by this provider.

## Options

- **baseURL** _string_: API URL prefix. Defaults to `https://api.concentrate.ai/v1`.
- **apiKey** _string_: API key. Defaults to `CONCENTRATE_API_KEY`.
- **headers** _Record&lt;string,string&gt;_: Custom request headers.
- **fetch** _FetchFunction_: Custom fetch implementation.
