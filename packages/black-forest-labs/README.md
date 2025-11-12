# AI SDK - fal Provider

The **[fal provider](https://ai-sdk.dev/providers/ai-sdk-providers/fal)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the [fal.ai API](https://fal.ai/).

## Setup

The fal provider is available in the `@ai-sdk/fal` module. You can install it with

```bash
npm i @ai-sdk/fal
```

## Provider Instance

You can import the default provider instance `fal` from `@ai-sdk/fal`:

```ts
import { fal } from '@ai-sdk/fal';
```

## Image Generation Example

```ts
import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';
const { image } = await generateImage({
  model: fal.image('fal-ai/flux/schnell'),
  prompt: 'A cat wearing a intricate robe',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

## Additional Options

If you want to pass additional inputs to the model besides the prompt, use the `providerOptions.fal` property:

```ts
const { image } = await generateImage({
  model: fal.image('fal-ai/recraft-v3'),
  prompt: 'A cat wearing a intricate robe',
  size: '1920x1080',
  providerOptions: {
    fal: {
      style: 'digital_illustration',
    },
  },
});
```

## Documentation

Please check out the **[fal provider](https://ai-sdk.dev/providers/ai-sdk-providers/fal)** for more information.
