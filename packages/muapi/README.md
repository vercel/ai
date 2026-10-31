# @ai-sdk/muapi

[MuAPI](https://muapi.ai) provider for the [Vercel AI SDK](https://sdk.vercel.ai) — image and video generation with 50+ models including Flux, Veo3, Kling, Wan, Seedance, Midjourney, and more.

## Installation

```bash
npm install @ai-sdk/muapi
# or
pnpm add @ai-sdk/muapi
# or
yarn add @ai-sdk/muapi
```

## Setup

Get your API key from [muapi.ai/dashboard/api-keys](https://muapi.ai/dashboard/api-keys).

```typescript
import { createMuapi } from '@ai-sdk/muapi';

const muapi = createMuapi({
  apiKey: process.env.MUAPI_API_KEY,
});
```

Or use the default singleton (reads `MUAPI_API_KEY` from env):

```typescript
import { muapi } from '@ai-sdk/muapi';
```

## Image Generation

```typescript
import { muapi } from '@ai-sdk/muapi';
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: muapi.image('flux-schnell'),
  prompt: 'a sunset over the ocean, photorealistic',
});

console.log(images[0].url);
```

### Available image models

| Model ID | Description |
|----------|-------------|
| `flux-schnell` | Flux Schnell — fast, high quality |
| `flux-dev` | Flux Dev |
| `flux-kontext-dev` / `flux-kontext-pro` / `flux-kontext-max` | Flux Kontext (text-to-image) |
| `hidream-fast` / `hidream-dev` / `hidream-full` | HiDream |
| `midjourney` / `midjourney-v7` / `midjourney-v8` | Midjourney |
| `gpt4o` | GPT-4o image generation |
| `gpt-image-2` | GPT Image 2 |
| `imagen4` / `imagen4-fast` / `imagen4-ultra` | Google Imagen 4 |
| `seedream` / `seedream-5` | Seedream |
| `wan2.1` / `wan2.5` / `wan2.6` | Wan |
| `qwen` / `qwen-2` / `qwen-2-pro` | Qwen |
| `reve` | Reve |
| `ideogram` | Ideogram v3 |
| `hunyuan` | Hunyuan |

## Video Generation

```typescript
import { muapi } from '@ai-sdk/muapi';
import { experimental_generateVideo as generateVideo } from 'ai';

const { videos } = await generateVideo({
  model: muapi.video('veo3-fast'),
  prompt: 'a timelapse of clouds moving over mountains',
});

console.log(videos[0].url);
```

### Available video models

| Model ID | Description |
|----------|-------------|
| `veo3` / `veo3-fast` / `veo3.1` / `veo4` | Google Veo |
| `kling-master` / `kling-v2.5-pro` / `kling-v3-pro` | Kling |
| `wan2.1` / `wan2.2` / `wan2.5` / `wan2.6` / `wan2.7` | Wan |
| `seedance-pro` / `seedance-pro-fast` | Seedance |
| `runway` | Runway |
| `pixverse` / `pixverse-v5` / `pixverse-v6` | Pixverse |
| `sora` / `sora-2` | OpenAI Sora |
| `hunyuan` | Hunyuan |
| `vidu` / `vidu-q2-pro` / `vidu-q3-pro` | Vidu |

## Image-to-Video

```typescript
import { muapi } from '@ai-sdk/muapi';
import { experimental_generateVideo as generateVideo } from 'ai';

const { videos } = await generateVideo({
  model: muapi.imageToVideo('kling-master'),
  prompt: 'zoom in slowly',
  image: { type: 'url', url: 'https://example.com/photo.jpg' },
});
```

## Provider options

Pass extra model-specific parameters via `providerOptions.muapi`:

```typescript
const { images } = await generateImage({
  model: muapi.image('flux-dev'),
  prompt: 'a cat',
  providerOptions: {
    muapi: {
      width: 1024,
      height: 768,
      num_inference_steps: 28,
    },
  },
});
```

## License

Apache-2.0
