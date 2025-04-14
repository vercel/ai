# AI SDK - Rev.ai Provider

The **[Rev.ai provider](https://sdk.vercel.ai/providers/ai-sdk-providers/revai)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the Rev.ai transcription API.

## Setup

The Rev.ai provider is available in the `@ai-sdk/revai` module. You can install it with

```bash
npm i @ai-sdk/revai
```

## Provider Instance

You can import the default provider instance `revai` from `@ai-sdk/revai`:

```ts
import { revai } from '@ai-sdk/revai';
```

## Example

```ts
import { revai } from '@ai-sdk/revai';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: revai.transcription('machine'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
  ),
});
```

## Documentation

Please check out the **[Rev.ai provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/revai)** for more information.
