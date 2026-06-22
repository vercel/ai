# AI SDK - SiliconFlow Provider

The **[SiliconFlow provider](https://ai-sdk.dev/providers/ai-sdk-providers/siliconflow)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [SiliconFlow](https://siliconflow.cn) API platform.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access SiliconFlow (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The SiliconFlow provider is available in the `@ai-sdk/siliconflow` module. You can install it with

```bash
npm i @ai-sdk/siliconflow
```

## Provider Instance

You can import the default provider instance `siliconflow` from `@ai-sdk/siliconflow`:

```ts
import { siliconflow } from '@ai-sdk/siliconflow';
```

## Example

```ts
import { siliconflow } from '@ai-sdk/siliconflow';
import { generateText } from 'ai';

const { text } = await generateText({
  model: siliconflow('Qwen/Qwen3-32B'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

Please check out the **[SiliconFlow provider](https://ai-sdk.dev/providers/ai-sdk-providers/siliconflow)** for more information.
