# AI SDK - Hume Provider

The **[Hume provider](https://ai-sdk.dev/providers/ai-sdk-providers/hume)** for the [AI SDK](https://ai-sdk.dev/docs)
contains support for the Hume API.

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
import { createHume } from '@ai-sdk/hume';

const hume = createHume({ apiKey: process.env.HUME_API_KEY });
```

Hume retired its text-to-speech (TTS) API on November 13, 2026, so this package no longer includes a speech model. See the [Hume Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/hume) for more information.
