# AI SDK - SiliconFlow Provider

The **[SiliconFlow provider](https://ai-sdk.dev/providers/ai-sdk-providers/siliconflow)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [SiliconFlow](https://siliconflow.cn) platform.

> **Deploying to Vercel?** With Vercel AI Gateway you can access SiliconFlow (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/siliconflow
```

## Usage

```ts
import { siliconflow } from '@ai-sdk/siliconflow';
import { generateText } from 'ai';

// Set SILICONFLOW_API_KEY in your environment.
const { text } = await generateText({
  model: siliconflow('Qwen/Qwen2.5-7B-Instruct'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [SiliconFlow provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/siliconflow) for more information.
