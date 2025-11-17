# AI SDK - Black Forest Labs Provider

The **[Black Forest Labs provider](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs)** for the [AI SDK](https://ai-sdk.dev/docs) adds image model support for the [Black Forest Labs API](https://docs.bfl.ai/).

## Setup

The Black Forest Labs provider is available in the `@ai-sdk/black-forest-labs` module. You can install it with

```bash
pnpm add @ai-sdk/black-forest-labs
```

## Provider Instance

You can import the default provider instance `blackForestLabs` from `@ai-sdk/black-forest-labs`:

```ts
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
```

## Image Generation Example

```ts
import fs from 'node:fs';
import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';

const { image } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.1'),
  prompt: 'A cat wearing a intricate robe',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

## Additional Options

If you want to pass additional inputs to the model besides the prompt, use the `providerOptions.blackForestLabs` property:

```ts
import {
  blackForestLabs,
  type BlackForestLabsImageProviderOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';

const { image } = await generateImage({
  model: blackForestLabs.image('flux-pro-1.1'),
  prompt: 'A cat wearing an intricate robe',
  aspectRatio: '16:9',
  providerOptions: {
    blackForestLabs: {
      outputFormat: 'png',
    } satisfies BlackForestLabsImageProviderOptions,
  },
});
```

## Configuring Base URL

By default, the provider uses `https://api.bfl.ai/v1`. You can override this to use regional or legacy endpoints:

```ts
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';

const blackForestLabs = createBlackForestLabs({
  baseURL: 'https://api.eu.bfl.ai/v1',
  apiKey: process.env.BFL_API_KEY,
});
```

## Documentation

See the [Black Forest Labs provider](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs) for more information.
