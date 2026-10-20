# AI SDK - HeyGen Provider

The **[HeyGen provider](https://ai-sdk.dev/providers/ai-sdk-providers/heygen)** for the [AI SDK](https://ai-sdk.dev/docs) supports text-to-video, image-to-video, and reference-to-video generation with `heygen-video-1`.

## Setup

```sh
npm install @ai-sdk/heygen
```

Set the `HEYGEN_API_KEY` environment variable or pass `apiKey` to `createHeyGen`.

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

The provider implements asynchronous submission and status retrieval. The AI SDK handles polling when you call `generateVideo`.

See the [provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/heygen) and [HeyGen API documentation](https://developers.heygen.com/docs/models/heygen-video) for supported inputs and options.
