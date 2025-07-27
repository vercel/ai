# AI SDK - AssemblyAI Provider

The **[AssemblyAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the AssemblyAI transcription API.

## Setup

The AssemblyAI provider is available in the `@ai-sdk/assemblyai` module. You can install it with

```bash
npm i @ai-sdk/assemblyai
```

## Provider Instance

You can import the default provider instance `assemblyai` from `@ai-sdk/assemblyai`:

```ts
import { assemblyai } from '@ai-sdk/assemblyai';
```

## Example

```ts
import { assemblyai } from '@ai-sdk/assemblyai';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: assemblyai.transcription('best'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
  ),
});
```

## Documentation

Please check out the **[AssemblyAI provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai)** for more information.
