# AI SDK - Deepgram Provider

The **[Deepgram provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepgram)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the Deepgram transcription API and speech model support for the Deepgram text-to-speech API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Deepgram (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/deepgram
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { deepgram } from '@ai-sdk/deepgram';
import { transcribe } from 'ai';

const { text } = await transcribe({
  model: deepgram.transcription('nova-3'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-functions/data/galileo.mp3',
  ),
});
```

See the [Deepgram Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/deepgram) for more information.
