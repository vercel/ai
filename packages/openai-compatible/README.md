# AI SDK - OpenAI Compatible Provider

This package provides a foundation for implementing providers that expose an OpenAI-compatible API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access hundreds of models from any provider — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/openai-compatible
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const { text } = await generateText({
  model: createOpenAICompatible({
    baseURL: 'https://api.example.com/v1',
    name: 'example',
    apiKey: process.env.MY_API_KEY,
  }).chatModel('meta-llama/Llama-3-70b-chat-hf'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [OpenAI Compatible Provider documentation](https://ai-sdk.dev/providers/openai-compatible-providers) for more information.
