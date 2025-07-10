# AI SDK - Baseten Provider

The **[Baseten provider](https://ai-sdk.dev/providers/ai-sdk-providers/baseten)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model and embedding model support for the [Baseten](https://baseten.co) platform.

## Setup

The Baseten provider is available in the `@ai-sdk/baseten` module. You can install it with

```bash
npm i @ai-sdk/baseten
```

## Provider Instance

You can import the default provider instance `baseten` from `@ai-sdk/baseten`:

```ts
import { baseten } from '@ai-sdk/baseten';
```

## Language Model Example (Model APIs)

```ts
import { baseten } from '@ai-sdk/baseten';
import { generateText } from 'ai';

const { text } = await generateText({
  model: baseten('deepseek-ai/DeepSeek-V3-0324'),
  prompt: 'What is the meaning of life?',
});
```

## Documentation

Please check out the **[Baseten provider](https://ai-sdk.dev/providers/ai-sdk-providers/baseten)** for more information.
