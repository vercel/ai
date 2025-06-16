# AI SDK - Gladia Provider

The **[Gladia provider](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the Gladia transcription API.

## Setup

The Gladia provider is available in the `@ai-sdk/gladia` module. You can install it with

```bash
npm i @ai-sdk/gladia
```

## Provider Instance

You can import the default provider instance `gladia` from `@ai-sdk/gladia`:

```ts
import { gladia } from '@ai-sdk/gladia';
```

## Example

```ts
import { gladia } from '@ai-sdk/gladia';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: gladia.transcription(),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
  ),
});
```

## Documentation

Please check out the **[Gladia provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/gladia)** for more information.
