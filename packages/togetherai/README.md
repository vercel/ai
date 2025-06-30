# AI SDK - Together.ai Provider

The **[Together.ai provider](https://ai-sdk.dev/providers/ai-sdk-providers/togetherai)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Together.ai](https://together.ai) platform.

## Setup

The Together.ai provider is available in the `@ai-sdk/togetherai` module. You can install it with

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

Please check out the **[Together.ai provider](https://ai-sdk.dev/providers/ai-sdk-providers/togetherai)** for more information.
