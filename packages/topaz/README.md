# AI SDK - Topaz Labs Provider

The **Topaz Labs provider** for the [AI SDK](https://ai-sdk.dev/docs) contains image and video model support for the [Topaz Labs API](https://developer.topazlabs.com).

Topaz models **enhance media you supply** — they upscale, denoise, sharpen and restore an existing image or video. They do not generate media from a text prompt.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access Topaz Labs (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The Topaz Labs provider is available in the `@ai-sdk/topaz` module. You can install it with:

```bash
npm i @ai-sdk/topaz
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `topaz` from `@ai-sdk/topaz`:

```ts
import { topaz } from '@ai-sdk/topaz';
```

## Image Models

| Model id     | Topaz model  | Description                              |
| ------------ | ------------ | ---------------------------------------- |
| `wonder-3.5` | `Wonder 3.5` | Generative upscaling and detail recovery |

The input image is passed as the prompt's `images`:

```ts
import { topaz } from '@ai-sdk/topaz';
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: topaz.image('wonder-3.5'),
  prompt: {
    images: ['https://example.com/photo.jpg'],
  },
  providerOptions: {
    topaz: {
      enhancementStrength: 'high',
      outputWidth: 4096,
      outputHeight: 4096,
    },
  },
});
```

The Topaz image API is asynchronous. The provider submits the job, polls until it finishes, and downloads the result, so `generateImage` resolves with the enhanced image. Use `pollIntervalMillis` and `pollTimeoutMillis` to tune that loop.

### Image provider options

| Option                | Type                                          | Description                                                        |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `enhancementStrength` | `'low' \| 'medium' \| 'high'`                 | How aggressively to enhance. Default `high`.                       |
| `grain`               | `boolean`                                     | Add grain to the output. Default `false`.                          |
| `grainDensity`        | `number` (0–1)                                | Grain intensity. Default 0.5.                                      |
| `grainModel`          | `'silver' \| 'gaussian' \| 'grey'`            | Grain model. Default `silver`.                                     |
| `grainSize`           | `number` (1–5)                                | Grain particle size. Default 1.                                    |
| `grainStrength`       | `number` (0–1)                                | Grain effect strength. Default 0.5.                                |
| `inputWidth`          | `number`                                      | Input width in pixels. Inferred from the upload when omitted.      |
| `inputHeight`         | `number`                                      | Input height in pixels. Inferred from the upload when omitted.     |
| `outputWidth`         | `number` (1–32000)                            | Output width. Takes precedence over the width from `size`.         |
| `outputHeight`        | `number` (1–32000)                            | Output height. Takes precedence over the height from `size`.       |
| `outputFormat`        | `'jpeg' \| 'jpg' \| 'png' \| 'tiff' \| 'tif'` | Output format.                                                     |
| `cropToFill`          | `boolean`                                     | Crop the output to fill the requested dimensions. Default `false`. |
| `webhookUrl`          | `string`                                      | URL to receive job-status webhooks.                                |
| `pollIntervalMillis`  | `number`                                      | Status poll interval. Default 2000.                                |
| `pollTimeoutMillis`   | `number`                                      | Maximum time to wait for the job. Default 600000.                  |

## Video Models

| Model id                | Topaz model | Description                                   |
| ----------------------- | ----------- | --------------------------------------------- |
| `proteus`               | `prob-4`    | Detail-preserving upscaling with fine control |
| `starlight-precise-2.6` | `slp-2.6`   | Generative upscaling with high fidelity       |

The input video is passed as an input reference:

```ts
import { topaz } from '@ai-sdk/topaz';
import { experimental_generateVideo as generateVideo } from 'ai';

const { videos } = await generateVideo({
  model: topaz.video('starlight-precise-2.6'),
  inputReferences: ['https://example.com/clip.mp4'],
  providerOptions: {
    topaz: {
      source: {
        width: 1920,
        height: 1080,
        duration: 10,
        frameRate: 30,
        frameCount: 300,
      },
      output: { width: 3840, height: 2160 },
      sharpness: 4,
    },
  },
});
```

### Source metadata is required

Topaz needs the input video's properties when the request is created, before the upload begins. The AI SDK does not inspect media files, so this metadata has to come from your side. The provider fills in what it can:

| Field        | Where it comes from                                                 |
| ------------ | ------------------------------------------------------------------- |
| `size`       | Derived from the input bytes.                                       |
| `container`  | Derived from the input's media type or URL extension.               |
| `resolution` | The `resolution` call option, or `source.width` / `source.height`.  |
| `duration`   | The `duration` call option, or `source.duration`.                   |
| `frameRate`  | The `fps` call option, or `source.frameRate`.                       |
| `frameCount` | `source.frameCount`, or `duration * frameRate` when both are known. |

`source.*` always takes precedence over the corresponding call option. If anything is still missing, the provider throws an error naming the fields it needs. Set `frameCount` explicitly for variable-frame-rate input, where `duration * frameRate` is not exact.

### Polling

Video enhancement is long-running, so the video models implement the AI SDK's async operation protocol. `generateVideo` polls to completion; use `experimental_startVideo` if you would rather persist the operation and check it later.

### Video provider options

Structural options:

| Option              | Type                             | Description                                                                                                                                                                        |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`            | object                           | Input video metadata (see above).                                                                                                                                                  |
| `output`            | object                           | Output `width`, `height`, `frameRate`, `audioCodec`, `audioTransfer`, `container`, `dynamicCompressionLevel`. Each defaults to the source value; audio defaults to `AAC` / `Copy`. |
| `additionalFilters` | `Array<Record<string, unknown>>` | Extra `filters[]` entries, e.g. a frame-interpolation filter.                                                                                                                      |
| `filter`            | `Record<string, unknown>`        | Escape hatch merged into the model's filter, overriding typed options.                                                                                                             |

Proteus filter settings: `videoType`, `auto`, `fieldOrder`, `focusFixLevel`, `compression`, `details`, `prenoise`, `noise`, `halo`, `preblur`, `blur`, `grain`, `grainSigma`, `grainSize`, `grainType`, `recoverOriginalDetailValue`.

Starlight Precise filter settings: `sharpness`, `videoBitDepth`, `videoCodec`, `videoProfile`, `watermark`.

See the [Proteus](https://developer.topazlabs.com/video-models/proteus/proteus-1) and [Starlight Precise 2.6](https://developer.topazlabs.com/video-models/starlight/starlight-precise-2.6) references for the accepted ranges.

## Authentication

Topaz Labs uses API key authentication. Create a key in your [Topaz Labs account](https://developer.topazlabs.com/getting-started/api-key-setup) and set the following environment variable:

```
TOPAZ_API_KEY=your-api-key
```

Or pass it directly:

```ts
import { createTopaz } from '@ai-sdk/topaz';

const topaz = createTopaz({
  apiKey: 'your-api-key',
});
```

## Documentation

Please check out the [Topaz Labs API documentation](https://developer.topazlabs.com) for more information.
