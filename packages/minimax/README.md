# AI SDK - Minimax Provider

The **[Minimax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the ElevenLabs chat and completion APIs and embedding model support for the ElevenLabs embeddings API.

## Setup

The Minimax provider is available in the `@ai-sdk/minimax` module. You can install it with

```bash
npm i @ai-sdk/minimax
```

## Provider Instance

You can import the default provider instance `minimax` from `@ai-sdk/minimax`:

```ts
import { minimax } from '@ai-sdk/minimax';
```

## Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const result = await generateSpeech({
  model: minimax.speech('speech-02-hd'),
  text: 'Hello, world!',
  providerOptions: { minimax: {} },
});
```

## Documentation

Please check out the **[Minimax provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for more information.
