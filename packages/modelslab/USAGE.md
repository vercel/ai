# ModelsLab Provider Example

Here's how to use the ModelsLab provider with the AI SDK:

## Installation

```bash
npm install @ai-sdk/modelslab
```

## Environment Setup

Set your ModelsLab API key:

```bash
export MODELSLAB_API_KEY="your-api-key-here"
```

## Basic Usage

```typescript
import { modelslab } from '@ai-sdk/modelslab';
import { generateImage } from 'ai';

async function generateImageExample() {
  const { image } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt: 'A beautiful sunset over snow-capped mountains',
  });

  // The image URLs will be available in the provider metadata
  console.log(
    'Generated image available at:',
    image.providerMetadata?.modelslab?.outputUrls,
  );
}
```

## Advanced Usage with Custom Options

```typescript
import { modelslab } from '@ai-sdk/modelslab';
import { generateImage } from 'ai';

async function generateImageWithOptions() {
  const { image } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt: 'A futuristic cyberpunk city at night',
    providerOptions: {
      modelslab: {
        negativePrompt: 'blurry, low quality, distorted',
        width: 1024,
        height: 1024,
        enhancePrompt: true,
        safetyChecker: true,
        samples: 1,
      },
    },
  });

  const metadata = image.providerMetadata?.modelslab;
  console.log('Generation time:', metadata?.generationTime, 'seconds');
  console.log('Image URLs:', metadata?.outputUrls);
  console.log('Proxy URLs:', metadata?.proxyLinks);
}
```

## Response Structure

The ModelsLab provider returns the image URLs in the provider metadata:

```typescript
{
  providerMetadata: {
    modelslab: {
      id: 91753437,
      generationTime: 1.06,
      outputUrls: [
        "https://pub-3626123a908346a7a8be8d9295f44e26.r2.dev/generations/uuid-0.png"
      ],
      proxyLinks: [
        "https://cdn2.stablediffusionapi.com/generations/uuid-0.png"
      ],
      meta: {
        // Additional metadata from ModelsLab API
      }
    }
  }
}
```

## Available Options

| Option            | Type           | Default       | Description                           |
| ----------------- | -------------- | ------------- | ------------------------------------- |
| `negativePrompt`  | string         | "bad quality" | Things to avoid in the image          |
| `width`           | number         | 512           | Image width in pixels                 |
| `height`          | number         | 512           | Image height in pixels                |
| `samples`         | number         | 1             | Number of images to generate (max: 4) |
| `safetyChecker`   | boolean        | true          | Enable NSFW content filtering         |
| `seed`            | number \| null | null          | Seed for reproducible results         |
| `instantResponse` | boolean        | false         | Enable instant response               |
| `base64`          | boolean        | false         | Return as base64 string               |
| `webhook`         | string \| null | null          | Webhook URL for notifications         |
| `trackId`         | string \| null | null          | Track ID for webhook identification   |
| `enhancePrompt`   | boolean        | false         | Enhance prompts for better results    |

## Error Handling

```typescript
try {
  const { image } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt: 'A beautiful landscape',
  });

  // Handle successful generation
} catch (error) {
  if (error.message.includes('ModelsLab API error')) {
    console.error('ModelsLab service error:', error);
  } else {
    console.error('General error:', error);
  }
}
```
