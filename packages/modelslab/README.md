# ModelsLab AI SDK Provider

The **ModelsLab provider** for the [AI SDK](https://ai-sdk.dev) contains support for ModelsLab text-to-image generation models.

## Setup

The ModelsLab provider is available in the `@ai-sdk/modelslab` module. You can install it with:

```bash
npm i @ai-sdk/modelslab
```

## Provider Instance

You can import the default provider instance `modelslab` from `@ai-sdk/modelslab`:

```ts
import { modelslab } from '@ai-sdk/modelslab';
```

## Example

```ts
import { modelslab } from '@ai-sdk/modelslab';
import { generateImage } from 'ai';

// Generate an image
const { image } = await generateImage({
  model: modelslab.image('realtime-text2img'),
  prompt: 'A beautiful sunset over mountains',
});
```

## Authentication

The ModelsLab provider requires an API key. You can set it as an environment variable:

```bash
MODELSLAB_API_KEY=your-api-key-here
```

Or pass it when creating the provider:

```ts
import { createModelslab } from '@ai-sdk/modelslab';

const modelslab = createModelslab({
  apiKey: 'your-api-key-here',
});
```

## Available Models

### Image Generation Models

- `realtime-text2img`: Fast text-to-image generation with 2-3 second generation time

## Provider-Specific Options

You can pass ModelsLab-specific options using the `providerOptions` parameter:

```ts
const { image } = await generateImage({
  model: modelslab.image('realtime-text2img'),
  prompt: 'A futuristic city',
  providerOptions: {
    modelslab: {
      negativePrompt: 'blurry, low quality',
      width: 1024,
      height: 1024,
      enhancePrompt: true,
      safetyChecker: true,
    },
  },
});
```

### Available Options

- `negativePrompt`: Description of things to avoid in the image
- `width`: Image width (default: 512)
- `height`: Image height (default: 512)
- `samples`: Number of images to generate (max: 4, default: 1)
- `safetyChecker`: Enable NSFW content filtering (default: true)
- `seed`: Seed for reproducible results (default: null for random)
- `instantResponse`: Enable instant response (default: false)
- `base64`: Return image as base64 string (default: false)
- `webhook`: URL for webhook notification
- `trackId`: Track ID for webhook identification
- `enhancePrompt`: Enhance prompts for better results (default: false)
