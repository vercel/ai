# AI SDK - Replicate Provider

Run models on [Replicate](https://replicate.com) using the [Vercel AI SDK](https://sdk.vercel.ai/docs).

## Installation

The Replicate provider is available in the `@ai-sdk/replicate` module, which is published on npm. You can install it with:

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

console.log(image);
```

If you want to pass additional inputs to the model besides the prompt, use the `providerOptions` property:

```ts
const { image } = await generateImage({
  model: replicate.image('black-forest-labs/flux-schnell'),
  prompt: 'The Loch Ness Monster getting a manicure, wide shot',
  providerOptions: {
    replicate: {
      input: { 
        aspect_ratio: '16:9',
        seed: 123456,
      },
    },
  },
});
```

## Development

To contribute to the Replicate provider, do the following:

Clone the repo:

```
git clone https://github.com/vercel/ai
```

Go into the `replicate` package:

```
cd packages/replicate
```

Install the dependencies (using [pnpm](https://pnpm.io/)):

```bash
pnpm install
```

Run the tests (again using pnpm):

```bash
pnpm test
```
