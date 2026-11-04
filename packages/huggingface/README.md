# AI SDK - Hugging Face Provider

The **[Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/index)** for the [Vercel AI SDK](https://ai-sdk.dev/docs) contains language model support for thousands of models through multiple inference providers via the Hugging Face router API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Hugging Face (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/huggingface
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';

const { text } = await generateText({
  model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

See the [Hugging Face Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/huggingface) for more information.
