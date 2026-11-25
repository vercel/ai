# AI SDK - Kling AI Provider

The **Kling AI provider** for the [AI SDK](https://ai-sdk.dev/docs) contains video model support for the [Kling AI API](https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview).

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Kling AI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

```bash
npm i ai @ai-sdk/klingai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { klingai } from '@ai-sdk/klingai';
import { experimental_generateVideo } from 'ai';

const { videos } = await experimental_generateVideo({
  model: klingai.video('kling-v3.0-t2v'),
  prompt: 'A chicken flying into the sunset in the style of 90s anime.',
  aspectRatio: '16:9',
  duration: 5,
  providerOptions: {
    klingai: {
      mode: 'std',
    },
  },
});
```

See the [Kling AI Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/klingai) for more information.
