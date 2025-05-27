# AI SDK - Gateway Provider

The Gateway provider for the [AI SDK](https://sdk.vercel.ai/docs) allows the use of a wide variety of AI models and providers.

## Setup

The Gateway provider is available in the `@vercel/ai-sdk-gateway` module. You can install it with

```bash
npm i @vercel/ai-sdk-gateway
```

## Provider Instance

You can import the default provider instance `gateway` from `@vercel/ai-sdk-gateway`:

```ts
import { gateway } from '@vercel/ai-sdk-gateway';
```

## Example

```ts
import { gateway } from '@vercel/ai-sdk-gateway';
import { generateText } from 'ai';

const { text } = await generateText({
  model: gateway('xai/grok-3-beta'),
  prompt:
    'Tell me about the history of the San Francisco Mission-style burrito.',
});
```

## Documentation

Please check out the [AI SDK documentation](https://sdk.vercel.ai/docs) for more information.
