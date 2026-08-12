# AI SDK - SiftQ Provider

The **SiftQ provider** for the [AI SDK](https://ai-sdk.dev/docs) adds asynchronous MiniMax-H3 V2 video generation through SiftQ. The provider has one fixed video model, so callers do not select or pass a model ID.

## Setup

```bash
npm install @ai-sdk/siftq
```

Set the API key in your environment:

```bash
SIFTQ_API_KEY=your-api-key
```

## Text-to-video

```ts
import { siftq, type SiftQVideoModelOptions } from '@ai-sdk/siftq';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: siftq.video(),
  prompt: 'A paper boat crossing a moonlit ocean, cinematic lighting',
  aspectRatio: '16:9',
  duration: 6,
  providerOptions: {
    siftq: { resolution: '2K' } satisfies SiftQVideoModelOptions,
  },
});
```

## Image-to-video

```ts
const { video } = await generateVideo({
  model: siftq.video(),
  prompt: {
    image: 'https://example.com/first-frame.png',
    text: 'The camera slowly moves forward while the lanterns flicker',
  },
  duration: 6,
  poll: { intervalMs: 5000, timeoutMs: 900000 },
});
```

## Custom provider instance

```ts
import { createSiftQ } from '@ai-sdk/siftq';

const siftq = createSiftQ({
  apiKey: process.env.SIFTQ_API_KEY,
  baseURL: 'https://siftq.com/api/minimax/',
});
```

The final create URL is `https://siftq.com/api/minimax/v2/video_generation` (one slash at the URL boundary).

See the [SiftQ provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/siftq) for all modes and options.
