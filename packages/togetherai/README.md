# AI SDK - Together AI Provider

The **[Together AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/togetherai)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Together AI](https://together.ai) platform.

## Setup

The Together AI provider is available in the `@ai-sdk/togetherai` module. You can install it with

```bash
npm i @ai-sdk/togetherai
```

## Provider Instance

You can import the default provider instance `togetherai` from `@ai-sdk/togetherai`:

```ts
import { togetherai } from '@ai-sdk/togetherai';
```

## Example

```ts
import { togetherai } from '@ai-sdk/togetherai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: togetherai('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'),
  prompt: 'Write a Python function that sorts a list:',
});
```

## Documentation

Please check out the **[Together AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/togetherai)** for more information.
