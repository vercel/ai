# AI SDK - Google Vertex AI Provider

The **[Google Vertex provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Google Vertex AI](https://cloud.google.com/vertex-ai) APIs.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Google Vertex AI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/google-vertex
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

const { text } = await generateText({
  model: vertex('gemini-3.8-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

See the [Google Vertex AI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex) for more information.
