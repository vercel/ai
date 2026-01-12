# AI SDK - ImageRouter Provider

The **[ImageRouter provider](https://ai-sdk.dev/providers/ai-sdk-providers/imagerouter)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the [ImageRouter API](https://docs.imagerouter.io/).

## Setup

The ImageRouter provider is available in the `@ai-sdk/imagerouter` module. You can install it with:

```bash
npm i @ai-sdk/imagerouter
```

## Provider Instance

You can import the default provider instance `imagerouter` from `@ai-sdk/imagerouter`:

```ts
import { imagerouter } from '@ai-sdk/imagerouter';
```

## Authentication

The ImageRouter provider requires an API key to authenticate requests. You can obtain an API key from [ImageRouter](https://imagerouter.io/api-keys).

You can set the API key in two ways:

1. Using the `IMAGEROUTER_API_KEY` environment variable (recommended):

```bash
export IMAGEROUTER_API_KEY=your_api_key_here
```

2. Passing it directly to the provider:

```ts
import { createImageRouter } from '@ai-sdk/imagerouter';

const imagerouter = createImageRouter({
  apiKey: 'your_api_key_here',
});
```

## Image Generation Example

### Text-to-Image

```ts
import { imagerouter } from '@ai-sdk/imagerouter';
import { generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: imagerouter.image('test/test'),
  prompt: 'A cat wearing an intricate robe',
});

const filename = `image-${Date.now()}.webp`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

### Image-to-Image Editing

```ts
import { imagerouter } from '@ai-sdk/imagerouter';
import { generateImage } from 'ai';
import fs from 'fs';

const inputImage = fs.readFileSync('input.png');

const { image } = await generateImage({
  model: imagerouter.image('openai/gpt-image-1'),
  prompt: 'Make the cat wear a wizard hat',
  files: [
    {
      type: 'file',
      data: inputImage,
      mediaType: 'image/png',
    },
  ],
});

fs.writeFileSync('edited-image.webp', image.uint8Array);
```

## Available Models

ImageRouter provides access to a wide variety of image generation models. You can find the complete list of available models at [https://imagerouter.io/models](https://imagerouter.io/models).

> The `test/test` model is free and available for development purposes.

## Additional Options

If you want to pass additional parameters to the model, use the `providerOptions.imagerouter` property:

```ts
const { image } = await generateImage({
  model: imagerouter.image('test/test'),
  prompt: 'A cat wearing an intricate robe',
  size: '1024x1024',
  providerOptions: {
    imagerouter: {
      quality: 'high',
    },
  },
});
```

### Supported Options

- `quality`: Image quality setting (`'auto'`, `'low'`, `'medium'`, `'high'`). Not all models support this feature.
- `size`: Image dimensions (`'auto'` or `'WIDTHxHEIGHT'` like `'1024x1024'`)
- `response_format`: Response format (`'url'`, `'b64_json'`, or `'b64_ephemeral'`)
- `output_format`: Image output format (`'webp'`, `'jpeg'`, or `'png'`)

## Custom Configuration

You can customize the provider configuration:

```ts
import { createImageRouter } from '@ai-sdk/imagerouter';

const imagerouter = createImageRouter({
  apiKey: 'your_api_key_here',
  baseURL: 'https://api.imagerouter.io', // Custom base URL
  headers: {
    'Custom-Header': 'value',
  },
});
```

## Documentation

For more information about ImageRouter, visit:

- [ImageRouter API Reference](https://docs.imagerouter.io/api-reference/image-generation)
- [Available Models](https://imagerouter.io/models) - or [list models with the API](https://docs.imagerouter.io/api-reference/models)
