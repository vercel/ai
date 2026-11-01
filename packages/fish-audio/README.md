# AI SDK - Fish Audio Provider

The **[Fish Audio provider](https://ai-sdk.dev/providers/ai-sdk-providers/fish-audio)** for the [AI SDK](https://ai-sdk.dev/docs)
contains speech generation (S1 and S2 models) and speech-to-text transcription support.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Fish Audio (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/fish-audio
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { fishAudio } from '@ai-sdk/fish-audio';
import { generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: fishAudio.speech('s1'),
  text: 'Hello from Fish Audio!',
  // A voice model ID from https://fish.audio, or omit for the default voice.
  voice: '933563129e564b19a115bedd57b7406a',
});
```

See the [Fish Audio Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/fish-audio) for more information.
