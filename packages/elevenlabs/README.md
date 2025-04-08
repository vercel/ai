# AI SDK - ElevenLabs Provider

The **[ElevenLabs provider](https://sdk.vercel.ai/providers/ai-sdk-providers/elevenlabs)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the ElevenLabs chat and completion APIs and embedding model support for the ElevenLabs embeddings API.

## Setup

The ElevenLabs provider is available in the `@ai-sdk/elevenlabs` module. You can install it with

```bash
npm i @ai-sdk/elevenlabs
```

## Provider Instance

You can import the default provider instance `elevenlabs` from `@ai-sdk/elevenlabs`:

```ts
import { elevenlabs } from '@ai-sdk/elevenlabs';
```

## Example

```ts
import { elevenlabs } from '@ai-sdk/elevenlabs';
import { generateText } from 'ai';

const { text } = await generateText({
  model: elevenlabs('eleven_turbo_v2_5'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[ElevenLabs provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/elevenlabs)** for more information.
