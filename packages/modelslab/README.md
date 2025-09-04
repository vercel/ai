# AI SDK - ModelsLab Provider

The **[AI SDK ModelsLab Provider](https://sdk.vercel.ai/docs/foundations/providers-and-models#providers)** is a TypeScript library designed to support ModelsLab's realtime text-to-image API.

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
import { experimental_generateImage as generateImage } from 'ai';

const { images } = await generateImage({
  model: modelslab.image('realtime-text2img'),
  prompt: 'A futuristic city with flying cars',
});
```

## Authentication

The ModelsLab provider will default to using the `MODELSLAB_API_KEY` environment variable. You can also pass the API key explicitly:

```ts
import { createModelsLab } from '@ai-sdk/modelslab';

const modelslab = createModelsLab({
  apiKey: 'your-api-key-here',
});
```

## Models

The provider supports the following image generation model:

- `realtime-text2img`: Fast text-to-image generation with 2-3 second generation time

## Settings

You can configure additional settings:

```ts
import { createModelsLab } from '@ai-sdk/modelslab';

const modelslab = createModelsLab({
  apiKey: 'your-api-key-here',
  baseURL: 'https://modelslab.com', // optional, defaults to ModelsLab API
});
```

## Available Functionality

The ModelsLab provider supports:

- **Image Generation**: Generate images from text prompts
- **Multiple Images**: Generate up to 4 images per request
- **Custom Sizes**: Support for different image dimensions
- **Seed Control**: Reproducible generation using seeds
- **Safety Filters**: Built-in NSFW content filtering

## API Features

- **Status Handling**: Supports both immediate (`success`) and processing (`processing`) responses
- **Future Links**: When status is `processing`, returns future links for image retrieval
- **Comprehensive Logging**: Full request/response logging for debugging

## Get Your API Key

You can get your ModelsLab API key from [https://modelslab.com/dashboard/api-keys](https://modelslab.com/dashboard/api-keys)
