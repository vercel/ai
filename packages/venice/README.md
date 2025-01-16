# AI SDK - Venice Provider

The **Venice provider** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for [Venice](https://venice.ai), offering high performance AI model inference with a focus on privacy and security.

## Setup

The Venice provider is available in the `@ai-sdk/venice` module. You can install it with

```bash
npm i @ai-sdk/venice
```

## Provider Instance

You can import the default provider instance `venice` from `@ai-sdk/venice`:

```ts
import { venice } from '@ai-sdk/venice';
```

## Available Models

Currently offered text models:

- `llama-3.2-3b`
- `llama-3.3-70b`
- `llama-3.1-405b`
- `dolphin-2.9.2-qwen2-72b`
- `qwen32b`

Currently offered image models:

- `fluently-xl`
- `flux-dev`
- `flux-dev-uncensored`
- `pony-realism`
- `stable-diffusion-3.5`


## Example

```ts
import { venice } from '@ai-sdk/venice';
import { generateText } from 'ai';

const { text } = await generateText({
  model: venice('llama-3.3-70b'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

For more information about Venice's API, uncensored models & high performance capabilities, please visit:

- [Venice FAQ](https://docs.venice.ai/welcome/about-venice)
- [Venice API Documentation](https://docs.venice.ai/api-reference/api-spec)
- [Venice Website](https://venice.ai)

