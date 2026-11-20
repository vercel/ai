# AI SDK - Cerebras Provider

The **Cerebras provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Cerebras](https://cerebras.ai), offering high-speed AI model inference powered by Cerebras Wafer-Scale Engines and CS-3 systems.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Cerebras (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/cerebras
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { cerebras } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

const { text } = await generateText({
  model: cerebras('gpt-oss-120b'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

See the [Cerebras Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/cerebras) for more information.
