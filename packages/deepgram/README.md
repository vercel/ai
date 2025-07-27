# AI SDK - Deepgram Provider

The **[Deepgram provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepgram)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the Deepgram transcription API.

## Setup

The Deepgram provider is available in the `@ai-sdk/deepgram` module. You can install it with

```bash
npm i @ai-sdk/deepgram
```

## Provider Instance

You can import the default provider instance `deepgram` from `@ai-sdk/deepgram`:

```ts
import { deepgram } from '@ai-sdk/deepgram';
```

## Example

```ts
import { deepgram } from '@ai-sdk/deepgram';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: deepgram.transcription('nova-3'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
  ),
});
```

## Documentation

Please check out the **[Deepgram provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/deepgram)** for more information.
