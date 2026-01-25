# AI SDK - ImageRouter Provider

The **[ImageRouter provider](https://ai-sdk.dev/providers/ai-sdk-providers/imagerouter)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the [ImageRouter API](https://docs.imagerouter.io/).

ImageRouter is a unified API gateway that provides access to multiple AI image generation models through an OpenAI-compatible interface. It allows you to generate images using various models from different providers without managing multiple API integrations.

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

Set the API key as an environment variable (recommended):

```bash
export IMAGEROUTER_API_KEY=your_api_key_here
```

Alternatively, you can pass it directly when creating a custom provider instance:

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

ImageRouter supports image-to-image editing for certain models. Simply provide input images using the `files` parameter:

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

### Specifying Image Size and Quality

You can control the output image size and quality:

```ts
const { image } = await generateImage({
  model: imagerouter.image('test/test'),
  prompt: 'A majestic mountain landscape',
  size: '1024x1024',
  providerOptions: {
    imagerouter: {
      quality: 'high',
      output_format: 'png',
    },
  },
});
```

## Available Models

ImageRouter provides access to a wide variety of image generation models from different providers. You can find the complete list of available models at:

- **Web Interface**: [https://imagerouter.io/models](https://imagerouter.io/models)
- **API**: [List Models API](https://docs.imagerouter.io/api-reference/models)

### Free Testing Model

The `test/test` model is free and available for development and testing purposes without requiring credits.

### Model ID Format

Models are referenced using the format `provider/model-name`, for example:
- `test/test` - Free test model
- `openai/gpt-image-1` - OpenAI's DALL-E model
- `flux/schnell` - Flux Schnell model

## Provider Options

You can pass additional parameters to customize image generation using the `providerOptions.imagerouter` property:

```ts
const { image } = await generateImage({
  model: imagerouter.image('test/test'),
  prompt: 'A cat wearing an intricate robe',
  size: '1024x1024',
  providerOptions: {
    imagerouter: {
      quality: 'high',
      output_format: 'webp',
      response_format: 'b64_json',
    },
  },
});
```

### Supported Options

| Option | Type | Description |
|--------|------|-------------|
| `quality` | `'auto' \| 'low' \| 'medium' \| 'high'` | Image quality setting. Not all models support this feature. |
| `size` | `'auto' \| string` | Image dimensions in `WIDTHxHEIGHT` format (e.g., `'1024x1024'`, `'512x768'`). Use `'auto'` for model default. |
| `output_format` | `'webp' \| 'jpeg' \| 'png'` | Output image file format. |
| `response_format` | `'url' \| 'b64_json' \| 'b64_ephemeral'` | How the image data is returned from the API. |

> **Note**: Model support for these options varies. Consult the [ImageRouter documentation](https://docs.imagerouter.io/api-reference/image-generation) for model-specific capabilities.

## Custom Configuration

You can create a custom ImageRouter provider instance with additional configuration:

```ts
import { createImageRouter } from '@ai-sdk/imagerouter';

const imagerouter = createImageRouter({
  apiKey: 'your_api_key_here',
  baseURL: 'https://api.imagerouter.io', // Custom base URL (optional)
  headers: {
    'Custom-Header': 'value', // Custom HTTP headers (optional)
  },
});
```

## Limitations

- **Aspect Ratio**: Not directly supported. Use the `size` option instead to specify exact dimensions.
- **Seed**: Not supported at the moment.

## Documentation

For more information about ImageRouter:

- **[AI SDK ImageRouter Provider Docs](https://ai-sdk.dev/providers/ai-sdk-providers/imagerouter)**
- **[ImageRouter API Reference](https://docs.imagerouter.io/api-reference/image-generation)**
- **[Available Models](https://imagerouter.io/models)**
- **[List Models API](https://docs.imagerouter.io/api-reference/models)**
