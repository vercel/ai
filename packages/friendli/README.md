# AI SDK - friendli Provider

The **[FriendliAI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/friendli)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [FriendliAI](https://friendli.ai) platform.

## Setup

The FriendliAI provider is available in the `@ai-sdk/friendli` module. You can install it with

\```bash
npm i @ai-sdk/friendli
\```

## Provider Instance

You can import the default provider instance `friendli` from `@ai-sdk/friendli`:

\```ts
import { friendli } from '@ai-sdk/friendli';
\```

## Example

\```ts
import { friendli } from '@ai-sdk/friendli';
import { generateText } from 'ai';

const { text } = await generateText({
model: friendli(''),
prompt: 'Write a JavaScript function that sorts a list:',
});
\```

## Documentation

Please check out the **[friendli provider](https://sdk.vercel.ai/providers/ai-sdk-providers/friendli)** for more information.
