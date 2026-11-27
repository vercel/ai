# AI SDK - Hume Provider

The **[Hume provider](https://ai-sdk.dev/providers/ai-sdk-providers/hume)** for the [AI SDK](https://ai-sdk.dev/docs)
supports the Hume Audio Decisions API, which answers Boolean, Choice, and Score questions about MP3 or WAV audio.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Hume (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/hume
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { hume } from '@ai-sdk/hume';
import { experimental_decide } from 'ai';
import { readFileSync } from 'node:fs';

// Set HUME_API_KEY in your environment.
const result = await experimental_decide({
  model: hume.decisionModel('audio-decisions'),
  state: [
    {
      type: 'file',
      mediaType: 'audio/mpeg',
      data: readFileSync('voicemail.mp3'),
    },
  ],
  questions: {
    frustrated: {
      type: 'boolean',
      instructions: 'Does the caller sound frustrated?',
    },
  },
});

console.log(result.answers.frustrated.probability);
```

See the [Hume provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/hume) for more information.
