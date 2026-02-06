# AI SDK - Kling AI Provider

The **Kling AI provider** for the [AI SDK](https://ai-sdk.dev/docs) contains video model support for the [Kling AI API](https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview).

## Setup

The Kling AI provider is available in the `@ai-sdk/klingai` module. You can install it with:

```bash
npm i @ai-sdk/klingai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `klingai` from `@ai-sdk/klingai`:

```ts
import { klingai } from '@ai-sdk/klingai';
```

## Video Generation Example

```ts
import { klingai } from '@ai-sdk/klingai';
import { experimental_generateVideo } from 'ai';

const { videos } = await experimental_generateVideo({
  model: klingai.video('kling-v2.6-motion-control'),
  prompt: {
    image: 'https://example.com/character.png',
    text: 'The character performs a smooth dance move',
  },
  providerOptions: {
    klingai: {
      videoUrl: 'https://example.com/reference-motion.mp4',
      characterOrientation: 'image',
      mode: 'std',
    },
  },
});
```

## Additional Options

Use `providerOptions.klingai` to configure motion control options:

```ts
const { videos } = await experimental_generateVideo({
  model: klingai.video('kling-v2.6-motion-control'),
  prompt: {
    image: 'https://example.com/character.png',
    text: 'The character performs a smooth dance move',
  },
  providerOptions: {
    klingai: {
      videoUrl: 'https://example.com/reference-motion.mp4',
      characterOrientation: 'video',
      mode: 'pro',
      keepOriginalSound: 'yes',
      watermarkEnabled: true,
      pollIntervalMs: 10000,
      pollTimeoutMs: 600000,
    },
  },
});
```

## Authentication

Kling AI uses access key / secret key authentication. Set the following environment variables:

```
KLINGAI_ACCESS_KEY=your-access-key
KLINGAI_SECRET_KEY=your-secret-key
```

Or pass them directly:

```ts
import { createKlingAI } from '@ai-sdk/klingai';

const klingai = createKlingAI({
  accessKey: 'your-access-key',
  secretKey: 'your-secret-key',
});
```

## Documentation

Please check out the [Kling AI API documentation](https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview) for more information.
