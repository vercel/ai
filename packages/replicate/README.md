# AI SDK - Replicate Provider

The **[Replicate provider](https://ai-sdk.dev/providers/ai-sdk-providers/replicate)** for the [AI SDK](https://ai-sdk.dev/docs) contains image model support for the Replicate API.

## Setup

The Replicate provider is available in the `@ai-sdk/replicate` module. You can install it with

```bash
npm i @ai-sdk/replicate
```

## Usage

```ts
import { replicate } from '@ai-sdk/replicate';
import { experimental_generateImage as generateImage } from 'ai';

const { image } = await generateImage({
  model: replicate.image('black-forest-labs/flux-schnell'),
  prompt: 'The Loch Ness Monster getting a manicure',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

If you want to pass additional inputs to the model besides the prompt, use the `providerOptions.replicate` property:

```ts
const { image } = await generateImage({
  model: replicate.image('recraft-ai/recraft-v3'),
  prompt: 'The Loch Ness Monster getting a manicure',
  size: '1365x1024',
  providerOptions: {
    replicate: {
      style: 'realistic_image',
    },
  },
});
```

## Documentation

Please check out the **[Replicate provider](https://ai-sdk.dev/providers/ai-sdk-providers/replicate)** for more information.
