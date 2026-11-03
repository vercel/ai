# AI SDK - Alibaba Provider

The **[Alibaba provider](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model, embedding model, and video model support for [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/), including the Qwen model series with advanced reasoning capabilities.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Alibaba (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/alibaba
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';

const { text } = await generateText({
  model: alibaba('qwen-plus'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Alibaba Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/alibaba) for more information.
