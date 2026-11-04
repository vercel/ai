# AI SDK - AssemblyAI Provider

The **[AssemblyAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains transcription model support for the AssemblyAI transcription API.

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
  model: assemblyai.transcription('universal-3-5-pro'),
  audio: new URL(
    'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-functions/data/galileo.mp3',
  ),
});
```

See the [AssemblyAI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/assemblyai) for more information.
