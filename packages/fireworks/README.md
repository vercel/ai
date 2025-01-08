# AI SDK - Fireworks Provider

The **[Fireworks provider](https://sdk.vercel.ai/providers/ai-sdk-providers/fireworks)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model and image modelsupport for the [Fireworks](https://fireworks.ai) platform.

## Setup

The Fireworks provider is available in the `@ai-sdk/fireworks` module. You can install it with

```bash
npm i @ai-sdk/fireworks
```

## Provider Instance

You can import the default provider instance `fireworks` from `@ai-sdk/fireworks`:

```ts
import { fireworks } from '@ai-sdk/fireworks';
```

## Language Model Example

```ts
import { fireworks } from '@ai-sdk/fireworks';
import { generateText } from 'ai';

const { text } = await generateText({
model: fireworks('accounts/fireworks/models/deepseek-v3'),
prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Image Model Examples

### Fireworks Image Model

```ts
import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: fireworks.image('accounts/fireworks/models/flux-1-dev-fp8'),
  prompt: 'A serene mountain landscape at sunset',
});
const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

### Stability AI Model served via Fireworks

```ts
import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

// Requires STABILITY_API_KEY environment variable or explicit stabilityApiKey in provider options
const { image } = await generateImage({
  model: fireworks.image('accounts/stability/models/sd3-turbo'),
  prompt: 'A futuristic cityscape at night',
});
const filename = `image-${Date.now()}.png`;
fs.writeFileSync(filename, image.uint8Array);
console.log(`Image saved to ${filename}`);
```

## Documentation

Please check out the **[Fireworks provider](https://sdk.vercel.ai/providers/ai-sdk-providers/fireworks)** for more information.
