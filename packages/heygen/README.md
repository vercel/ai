# AI SDK - HeyGen Provider

The **[HeyGen provider](https://ai-sdk.dev/providers/ai-sdk-providers/heygen)** for the [AI SDK](https://ai-sdk.dev/docs) supports text-to-video, image-to-video, and reference-to-video generation with `heygen-video-1`.

## Setup

```bash
npm i ai @ai-sdk/heygen
```

## Usage

```ts
import { heygen } from '@ai-sdk/heygen';
import { experimental_generateVideo as generateVideo } from 'ai';

const { videos } = await generateVideo({
  model: heygen.video('heygen-video-1'),
  prompt:
    'A paper boat floats down a quiet stream, with the sound of flowing water.',
  duration: 5,
  aspectRatio: '16:9',
});
```

See the [HeyGen Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/heygen) for more information.
