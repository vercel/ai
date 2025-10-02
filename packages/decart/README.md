# AI SDK - Decart Provider

The **Decart provider** for the [AI SDK](https://ai-sdk.dev/docs) contains support for [Decart](https://decart.ai)'s image generation models.

## Setup

The Decart provider is available in the `@ai-sdk/decart` module. You can install it with:

```bash
npm i @ai-sdk/decart
```

## Provider Instance

You can import the default provider instance `decart` from `@ai-sdk/decart`:

```ts
import { decart } from '@ai-sdk/decart';
```

## Image Generation Example

```ts
import { decart } from '@ai-sdk/decart';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: decart.image('lucy-pro-t2i'),
  prompt: 'Three dogs playing in the snow',
});

const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

## Documentation

Please check out the **[AI SDK documentation](https://ai-sdk.dev/docs)** for more information.
