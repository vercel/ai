# AI SDK - Firemoon Provider

The **Firemoon provider** for the [AI SDK](https://ai-sdk.dev/docs) contains image generation support for the Firemoon Studio API.

## Setup

The Firemoon provider is available in the `firemoon-ai-sdk-provider` module. You can install it with:

```bash
npm i firemoon-ai-sdk-provider
```

## Provider Instance

You can import the default provider instance `firemoon` from `firemoon-ai-sdk-provider`:

```ts
import { firemoon } from 'firemoon-ai-sdk-provider';
```

## Configuration

If you need to configure the provider, you can use the `createFiremoon` function:

```ts
import { createFiremoon } from 'firemoon-ai-sdk-provider';

const firemoon = createFiremoon({
  apiKey: 'your-api-key', // defaults to FIREMOON_API_KEY environment variable
  baseURL: 'https://firemoon.studio/api', // optional, defaults to Firemoon Studio API
});
```

## Usage

### Image Generation

Generate images using FLUX models:

```ts
import { firemoon } from 'firemoon-ai-sdk-provider';
import { experimental_generateImage as generateImage } from 'ai';

const { image } = await generateImage({
  model: firemoon.image('flux/dev'),
  prompt: 'A serene mountain landscape at sunset',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

### Advanced Image Generation

Pass additional options using `providerOptions`:

```ts
const { image } = await generateImage({
  model: firemoon.image('flux/dev'),
  prompt: 'A futuristic city with flying cars',
  size: 'landscape_16_9',
  providerOptions: {
    firemoon: {
      guidance_scale: 7.5,
      num_inference_steps: 35,
      seed: 12345,
    },
  },
});
```

### Multiple Images

Generate multiple images in a single request:

```ts
const { images } = await generateImage({
  model: firemoon.image('flux/dev'),
  prompt: 'A beautiful sunset',
  n: 4, // Generate 4 images
});

images.forEach((image, index) => {
  fs.writeFileSync(`image-${index}.png`, image.uint8Array);
});
```

## Supported Models

### Image Models

- **FLUX Models**

  - `flux/dev` - Fast, high-quality image generation
  - `flux/schnell` - Rapid image generation
  - `flux/pro` - Professional-grade images

- **Fine-tuned Models**

  - `firemoon-studio/better-faces` - Enhances image details, creativity, and contrast for improved visual quality
  - `firemoon-studio/cosplay-costumes` - Generates various character costumes and cosplay outfits
  - `firemoon-studio/detail-maximizer` - Enhances image details, creativity, and contrast for improved visual quality

- **Ideogram Models**
  - `ideogram/v3` - Advanced image generation
  - `ideogram/v3-turbo` - Fast ideogram generation
  - `ideogram/v3-character-edit` - Character editing


## Model Options

### Common Options

All models support these options via `providerOptions.firemoon`:

- `seed` (number) - Random seed for reproducible results
- `num_images` (number) - Number of images to generate (1-4)

### Image Model Options

FLUX and Ideogram models support:

- `image_size` (string) - Image dimensions: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`
- `guidance_scale` (number) - How closely to follow the prompt (1-20)
- `num_inference_steps` (number) - Number of denoising steps (1-50)


## Authentication

You need a Firemoon Studio API key to use this provider. You can obtain one from:

1. Sign in to [Firemoon Studio](https://firemoon.studio)
2. Navigate to the [API Keys page](https://firemoon.studio/keys)
3. Create a new API key

Set your API key as an environment variable:

```bash
export FIREMOON_API_KEY=your_api_key_here
```

Or pass it directly when creating the provider:

```ts
const firemoon = createFiremoon({
  apiKey: 'your_api_key_here',
});
```

## Error Handling

The provider handles various error scenarios:

- **401 Unauthorized** - Invalid or missing API key
- **403 Forbidden** - Access denied or insufficient credits
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Generation failed

Example error handling:

```ts
try {
  const { image } = await generateImage({
    model: firemoon.image('flux/dev'),
    prompt: 'A beautiful landscape',
  });
} catch (error) {
  console.error('Generation failed:', error.message);
}
```

## Documentation

For more information about Firemoon Studio:

- [Firemoon Studio](https://firemoon.studio)
- [API Documentation](https://firemoon.studio)
- [Quickstart Guide](https://firemoon.studio)

For more information about the AI SDK:

- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [AI SDK on GitHub](https://github.com/vercel/ai)

## Support

Need help? Contact Firemoon Studio at [hi@firemoon.studio](mailto:hi@firemoon.studio)
