# AI SDK - Fireworks Provider

The **[Fireworks provider](https://sdk.vercel.ai/providers/ai-sdk-providers/fireworks)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Fireworks](https://fireworks.ai) platform.

## Setup

The Fireworks provider is available in the `@ai-sdk/fireworks` module. You can install it with

\```bash
npm i @ai-sdk/fireworks
\```

## Provider Instance

You can import the default provider instance `fireworks` from `@ai-sdk/fireworks`:

\```ts
import { fireworks } from '@ai-sdk/fireworks';
\```

## Example

\```ts
import { fireworks } from '@ai-sdk/fireworks';
import { generateText } from 'ai';

const { text } = await generateText({
model: fireworks('accounts/fireworks/models/llama-v2-13b-chat'),
prompt: 'Write a JavaScript function that sorts a list:',
});
\```

## Documentation

Please check out the **[Fireworks provider](https://sdk.vercel.ai/providers/ai-sdk-providers/fireworks)** for more information.
