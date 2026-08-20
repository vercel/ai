---
title: Black Forest Labs
description: Learn how to use Black Forest Labs models with the AI SDK.
---

# Black Forest Labs Provider

[Black Forest Labs](https://bfl.ai/) provides a generative image platform for developers with FLUX-based models. Their platform offers fast, high quality, and in-context image generation and editing with precise and coherent results.

## Setup

The Black Forest Labs provider is available via the `@ai-sdk/black-forest-labs` module. You can install it with

<InstallPackages packages="@ai-sdk/black-forest-labs" />

## Provider Instance

You can import the default provider instance `blackForestLabs` from `@ai-sdk/black-forest-labs`:

```ts
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
```

If you need a customized setup, you can import `createBlackForestLabs` and create a provider instance with your settings:

```ts
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';

const blackForestLabs = createBlackForestLabs({
  apiKey: 'your-api-key', // optional, defaults to BFL_API_KEY environment variable
  baseURL: 'custom-url', // optional
  headers: {
    /* custom headers */
  }, // optional
});
```

You can use the following optional settings to customize the Black Forest Labs provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls, e.g. to use a regional endpoint.
  The default prefix is `https://api.bfl.ai/v1`.

- **apiKey** _string_

  API key that is being sent using the `x-key` header.
  It defaults to the `BFL_API_KEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.
  You can use it as a middleware to intercept requests,
  or to provide a custom fetch implementation for e.g. testing.

- **pollIntervalMillis** _number_

  Interval in milliseconds between polling attempts when waiting for generation to complete.
  Defaults to 500ms for image models and 2000ms for video models.

- **pollTimeoutMillis** _number_

  Overall timeout in milliseconds for polling before giving up.
  Defaults to 60000ms (60 seconds) for image models and 600000ms (10 minutes) for video models.

## Image Models

You can create Black Forest Labs image models using the `.image()` factory method.
For more on image generation with the AI SDK see [generateImage()](/docs/reference/ai-sdk-core/generate-image).

### Basic Usage

```ts
import { writeFileSync } from 'node:fs';
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { image, providerMetadata } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.1'),
  prompt: 'A serene mountain landscape at sunset',
});

const filename = `image-${Date.now()}.png`;
writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

### Model Capabilities

Black Forest Labs offers many models optimized for different use cases. Here are a few popular examples. For a full list of models, see the [Black Forest Labs Models Page](https://bfl.ai/models).

| Model                | Description                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `flux-kontext-pro`   | FLUX.1 Kontext [pro] handles both text and reference images as inputs, enabling targeted edits and complex transformations |
| `flux-kontext-max`   | FLUX.1 Kontext [max] with improved prompt adherence and typography generation                                              |
| `flux-pro-1.1-ultra` | Ultra-fast, ultra high-resolution image creation                                                                           |
| `flux-pro-1.1`       | Fast, high-quality image generation from text.                                                                             |
| `flux-pro-1.0-fill`  | Inpainting model for filling masked regions of images with new content                                                     |

Black Forest Labs models support aspect ratios from 3:7 (portrait) to 7:3 (landscape).

### Image Editing

Black Forest Labs Kontext models support powerful image editing capabilities using reference images. Pass input images via `prompt.images` to transform, combine, or edit existing images.

#### Single Image Editing

Transform an existing image using text prompts:

```ts
import {
  blackForestLabs,
  BlackForestLabsImageModelOptions,
} from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: blackForestLabs.image('flux-kontext-pro'),
  prompt: {
    text: 'A baby elephant with a shirt that has the logo from the input image.',
    images: [
      'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
    ],
  },
  providerOptions: {
    blackForestLabs: {
      width: 1024,
      height: 768,
    } satisfies BlackForestLabsImageModelOptions,
  },
});
```

#### Multi-Reference Editing

Combine multiple reference images for complex transformations. Black Forest Labs supports up to 10 input images:

```ts
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: blackForestLabs.image('flux-kontext-pro'),
  prompt: {
    text: 'Combine the style of image 1 with the subject of image 2',
    images: [
      'https://example.com/style-reference.jpg',
      'https://example.com/subject-reference.jpg',
    ],
  },
});
```

<Note>
  Input images can be provided as URLs or base64-encoded strings. They support
  up to 20MB or 20 megapixels per image.
</Note>

#### Inpainting

The `flux-pro-1.0-fill` model supports inpainting, which allows you to fill masked regions of an image with new content. Pass the source image via `prompt.images` and a mask image via `prompt.mask`:

```ts
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.0-fill'),
  prompt: {
    text: 'A beautiful garden with flowers',
    images: ['https://example.com/source-image.jpg'],
    mask: 'https://example.com/mask-image.png',
  },
});
```

The mask image should be a grayscale image where white areas indicate regions to be filled and black areas indicate regions to preserve.

### Provider Options

Black Forest Labs image models support flexible provider options through the `providerOptions.blackForestLabs` object. The supported parameters depend on the used model ID:

- **width** _number_ - Output width in pixels (256–1920). When set, this overrides any width derived from `size`.
- **height** _number_ - Output height in pixels (256–1920). When set, this overrides any height derived from `size`.
- **outputFormat** _string_ - Desired format of the output image (`"jpeg"` or `"png"`).
- **steps** _number_ - Number of inference steps. Higher values may improve quality but increase generation time.
- **guidance** _number_ - Guidance scale for generation. Higher values follow the prompt more closely.
- **imagePrompt** _string_ - Base64-encoded image to use as additional visual context for generation.
- **imagePromptStrength** _number_ - Strength of the image prompt influence on generation (0.0 to 1.0).
- **promptUpsampling** _boolean_ - If true, performs upsampling on the prompt.
- **raw** _boolean_ - Enable raw mode for more natural, authentic aesthetics.
- **safetyTolerance** _number_ - Moderation level for inputs and outputs (0 = most strict, 6 = more permissive).
- **pollIntervalMillis** _number_ - Interval in milliseconds between polling attempts (default 500ms).
- **pollTimeoutMillis** _number_ - Overall timeout in milliseconds for polling before timing out (default 60s).
- **webhookUrl** _string_ - URL for asynchronous completion notification. Must be a valid HTTP/HTTPS URL.
- **webhookSecret** _string_ - Secret for webhook signature verification, sent in the `X-Webhook-Secret` header.

<Note>
  To pass reference images for editing, use `prompt.images` instead of provider
  options. This supports up to 10 images as URLs or base64-encoded strings.
</Note>

### Provider Metadata

The `generateImage` response includes provider-specific metadata in `providerMetadata.blackForestLabs.images[]`. Each image object may contain the following properties:

- **seed** _number_ - The seed used for generation. Useful for reproducing results.
- **start_time** _number_ - Unix timestamp when generation started.
- **end_time** _number_ - Unix timestamp when generation completed.
- **duration** _number_ - Generation duration in seconds.
- **cost** _number_ - Cost of the generation request.
- **inputMegapixels** _number_ - Input image size in megapixels.
- **outputMegapixels** _number_ - Output image size in megapixels.

```ts
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';

const { image, providerMetadata } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.1'),
  prompt: 'A serene mountain landscape at sunset',
});

// Access provider metadata
const metadata = providerMetadata?.blackForestLabs?.images?.[0];
console.log('Seed:', metadata?.seed);
console.log('Cost:', metadata?.cost);
console.log('Duration:', metadata?.duration);
```

### Regional Endpoints

By default, requests are sent to `https://api.bfl.ai/v1`. You can select a [regional endpoint](https://docs.bfl.ai/api_integration/integration_guidelines#regional-endpoints) by setting `baseURL` when creating the provider instance:

```ts
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';

const blackForestLabs = createBlackForestLabs({
  baseURL: 'https://api.eu.bfl.ai/v1', // or https://api.us.bfl.ai/v1
});
```

## Video Models

You can generate videos with the FLUX 3 video model using the
[`experimental_generateVideo`](/docs/reference/ai-sdk-core/generate-video)
function:

```ts
import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: blackForestLabs.video('flux-3-video'),
  prompt: 'A white kitten chases a butterfly across a sunlit garden.',
  aspectRatio: '16:9',
  duration: 8,
  poll: {
    intervalMs: 2000,
    timeoutMs: 600000, // 10 minutes
  },
  providerOptions: {
    blackForestLabs: {
      resolution: 'fhd',
    } satisfies BlackForestLabsVideoModelOptions,
  },
});
```

FLUX 3 generates one video per call. Generation is asynchronous — the model
submits a job and polls until it completes, then passes the signed MP4 URL to AI
SDK Core. `generateVideo` downloads it before resolving, so `video` is a
`GeneratedFile`. The signed URL remains available in
`providerMetadata.blackForestLabs.videos[0].videoUrl`.

Use the top-level `poll` option to have AI SDK Core orchestrate polling and set
the interval and timeout. The FLUX 3 video API does not currently expose a
webhook callback input, so a top-level `webhook` falls back to polling.

`duration` accepts a whole number of seconds from 5 to 20. A fractional value is
rounded and an out-of-range value is clamped, each with a warning. Omit it to let
FLUX 3 fit the duration to the content.

Audio is generated by default, so `generateAudio` only has to be set to turn it
off. `fps` and `seed` are not supported by the API and are reported as warnings.

<Note>
  The URL in provider metadata is time-limited. Persist the returned `video`
  bytes to your own storage.
</Note>

### Resolution and aspect ratio

The API takes a named resolution tier, `hd` or `fhd` (the default is `hd`), where
`fhd` is finished by the video upsampler. The exact frame size depends on the
aspect ratio.

The top-level `resolution` option is `{width}x{height}`, so it is mapped onto a
tier by its shorter side — `1280x720` becomes `hd` and `1920x1080` becomes `fhd`.
Other values map to `hd` when the shorter side is at most 720 pixels, and to
`fhd` above 720, with a warning reporting the mapping. Use
`providerOptions.blackForestLabs.resolution` to set the tier directly.

`aspectRatio` accepts `21:9`, `2:1`, `16:9`, `4:3`, `1:1`, `3:4`, and `9:16`. The
API default is `auto`, which infers the ratio from the prompt and any
conditioning media; because the top-level option must be `{width}:{height}`,
`auto` can only be requested through
`providerOptions.blackForestLabs.aspectRatio`.

### Generation modes

FLUX 3 is a single endpoint with a `mode` discriminator. The mode is inferred
from the inputs you pass:

- **Text-to-video** — `prompt` only.
- **Image-to-video** — pass `image` (or a `frameImages` entry with
  `frameType: 'first_frame'`) to animate a starting image. Adding a `last_frame`
  closes the clip on that image. A `last_frame` without a `first_frame` cannot be
  expressed, and is dropped with a warning.
- **Keyframes** — for more than two images, or images pinned to a specific
  second, pass `providerOptions.blackForestLabs.keyframes`. It takes precedence
  over `image` and `frameImages`.
- **Video continuation** — pass a video-typed entry in `inputReferences` to
  continue from the final frames of an existing MP4. FLUX 3 accepts a single
  video; keyframes and continuation are mutually exclusive.
- **Draft enhance** — pass `providerOptions.blackForestLabs.draftCache`. See
  [Draft mode](#draft-mode).

FLUX 3 has no reference-image input, so an image passed in `inputReferences` is
ignored with a warning pointing at `image`, `frameImages`, or `keyframes`.

### Keyframes

Keyframes are positional: one image opens the clip, two open and close it, and
with more the first and last are the endpoints while the others are spaced evenly
between them. Each image is an `http(s)` URL or a base64 string, and a request
accepts 1 to 10 of them.

Three or more untimed keyframes require an explicit `duration`; the provider
reports a warning when that combination is sent, because the API rejects it.

Pass `[seconds, image]` pairs in chronological order to pin each image to a
second of the clip instead:

```ts
import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import { readFileSync } from 'node:fs';

const asBase64 = (file: string) => readFileSync(file).toString('base64');

const { video } = await generateVideo({
  model: blackForestLabs.video('flux-3-video'),
  prompt: 'The cat, then the dog, then the owl each take a turn in the room.',
  duration: 12,
  providerOptions: {
    blackForestLabs: {
      keyframes: [
        [0, asBase64('cat.png')],
        [4.5, asBase64('dog.png')],
        [9, asBase64('owl.png')],
      ],
    } satisfies BlackForestLabsVideoModelOptions,
  },
});
```

### Draft mode

Setting `draft: true` renders a fast, lower-quality preview and leaves behind an
encrypted bundle, reported as
`providerMetadata.blackForestLabs.videos[0].draftCache`. Passing that bundle back
as `draftCache` reproduces the same generation at full quality.

The bundle pins the original mode, prompt, seed, and conditioning media, so an
enhance request accepts nothing besides `safetyTolerance`. Any other option set
on the call is reported as an `unsupported` warning. `generateVideo` requires a
`prompt` argument, so pass an empty string to say there is nothing to add.

```ts
import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';

const draft = await generateVideo({
  model: blackForestLabs.video('flux-3-video'),
  prompt: 'A white kitten chases a butterfly across a sunlit garden.',
  duration: 6,
  providerOptions: {
    blackForestLabs: { draft: true } satisfies BlackForestLabsVideoModelOptions,
  },
});

const draftCacheUrl = (
  draft.providerMetadata.blackForestLabs?.videos as
    | Array<{ draftCache?: string }>
    | undefined
)?.[0]?.draftCache;

// The download URL expires; sending the base64 `.bin` is the durable path,
// though the URL itself also works while the link is still valid.
const response = await fetch(draftCacheUrl!);
const arrayBuffer = await response.arrayBuffer();

const enhanced = await generateVideo({
  model: blackForestLabs.video('flux-3-video'),
  prompt: '',
  providerOptions: {
    blackForestLabs: {
      draftCache: Buffer.from(arrayBuffer).toString('base64'),
    } satisfies BlackForestLabsVideoModelOptions,
  },
});
```

<Note>
  A draft and its enhance are two separate generations, and each is billed
  separately.
</Note>

### Video Provider Options

The following optional provider options are available for FLUX 3 video:

- **resolution** _'hd' | 'fhd'_

  Output resolution tier. Takes precedence over the top-level `resolution`.

- **aspectRatio** _'21:9' | '2:1' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto'_

  Aspect ratio of the generated video. Takes precedence over the top-level
  `aspectRatio`, and unlike it can be set to `auto`.

- **keyframes** _Array&lt;string | [number, string]&gt;_

  Keyframes for image-to-video generation, for the shapes `image` and
  `frameImages` cannot express: more than two images, or images pinned to a
  specific second. Takes precedence over both.

- **safetyTolerance** _number_

  Moderation strictness from 0 (strictest) to 4. Defaults to 2. Sexual content is
  capped at 3 and hate content at 2 regardless of the request, and any request
  carrying conditioning media is capped at 2.

- **draft** _boolean_

  Render a fast, lower-quality preview instead of the finished video. Defaults to
  `false`.

- **draftCache** _string_

  Encrypted draft-cache bundle from a prior `draft` generation, which switches the
  request to draft-enhance mode.

- **version** _string_

  Model version to pin. Only `latest` is available today.

### Video Provider Metadata

FLUX 3 video results include `providerMetadata.blackForestLabs.videos[]`. Each
video object may contain the following properties:

- **id** _string_ - ID of the Black Forest Labs generation request.
- **videoUrl** _string_ - The signed MP4 URL (the same URL as `video`). Time-limited.
- **draftCache** _string_ - Download URL for the draft bundle. Present only on a `draft` generation.
- **seed** _number_ - The seed used for generation, when reported by the API.
- **start_time** _number_ - Unix timestamp when generation started.
- **end_time** _number_ - Unix timestamp when generation completed.
- **duration** _number_ - Duration reported by the API, in seconds.
- **cost** _number_ - Cost of the generation request in credits.
- **inputMegapixels** _number_ - Input size in megapixels.
- **outputMegapixels** _number_ - Output size in megapixels.

### Video Model Capabilities

| Model          | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `flux-3-video` | Up to full-HD and 20 seconds, with synchronized audio. Text-to-video, keyframes, and video continuation. |
