# AI SDK - AssemblyAI Provider

The **[AssemblyAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the AssemblyAI pre-recorded and streaming transcription APIs and speech model support for the AssemblyAI text-to-speech API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access AssemblyAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/assemblyai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { assemblyai } from '@ai-sdk/assemblyai';
import { transcribe } from 'ai';

const { text } = await transcribe({
  model: assemblyai.transcription('assemblyai-stt-3-7'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-functions/data/galileo.mp3',
  ),
});
```

Stream live audio with the AssemblyAI-STT-3.7-Realtime models (experimental):

```ts
import { assemblyai } from '@ai-sdk/assemblyai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';

const result = streamTranscribe({
  model: assemblyai.transcription('assemblyai-stt-3-7-realtime-agent'),
  audio, // ReadableStream of 16-bit PCM chunks
  inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
});

for await (const part of result.fullStream) {
  if (part.type === 'transcript-final') console.log(part.text);
}
```

See the [AssemblyAI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai) for more information.
