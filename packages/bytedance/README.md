# AI SDK - ByteDance Provider

The **ByteDance provider** for the [AI SDK](https://ai-sdk.dev/docs) contains support for ByteDance's Seedance video generation models through the BytePlus ModelArk platform.

## About Seedance Models

Seedance is ByteDance's state-of-the-art video generation model family that delivers:

- High-quality text-to-video generation
- Image-to-video transformation
- Multiple aspect ratio support (16:9, 9:16, 1:1)
- Configurable video duration (5s, 10s)

## Setup

The ByteDance provider is available in the `@ai-sdk/bytedance` module. You can install it with:

```bash
npm i @ai-sdk/bytedance
```

## Provider Instance

You can import the default provider instance `byteDance` from `@ai-sdk/bytedance`:

```ts
import { byteDance } from '@ai-sdk/bytedance';
```

## Video Generation Example

```ts
import { byteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: byteDance.video('your-endpoint-id'),
  prompt: 'A cat playing with a ball of yarn',
  aspectRatio: '16:9',
  duration: 5,
});

console.log(video.url);
```

## Documentation

Please check out the **[ByteDance provider](https://ai-sdk.dev/providers/ai-sdk-providers/bytedance)** for more information.
