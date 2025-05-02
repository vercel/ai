# AI SDK - Cerebras Provider

The **Cerebras provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Cerebras](https://cerebras.ai), offering high-speed AI model inference powered by Cerebras Wafer-Scale Engines and CS-3 systems.

## Setup

The Cerebras provider is available in the `@ai-sdk/cerebras` module. You can install it with

```bash
npm i @ai-sdk/cerebras
```

## Provider Instance

You can import the default provider instance `cerebras` from `@ai-sdk/cerebras`:

```ts
import { cerebras } from '@ai-sdk/cerebras';
```

## Available Models

Currently, Cerebras offers two models:

### Llama 3.1 8B

- Model ID: `llama3.1-8b`
- 8 billion parameters
- Knowledge cutoff: March 2023
- Context Length: 8192
- Training Tokens: 15 trillion+

### Llama 3.3 70B

- Model ID: `llama-3.3-70b`
- 70 billion parameters
- Knowledge cutoff: December 2023
- Context Length: 8192
- Training Tokens: 15 trillion+

## Example

```ts
import { cerebras } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

const { text } = await generateText({
  model: cerebras('llama3.1-8b'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

For more information about Cerebras' high-speed inference capabilities and API documentation, please visit:

- [Cerebras Inference Documentation](https://inference-docs.cerebras.ai/introduction)
- [Cerebras Website](https://cerebras.ai)

Note: Due to high demand in the early launch phase, context windows are temporarily limited to 8192 tokens in the Free Tier.
