# AI SDK - Inference Cooperative Provider

The **Inference Cooperative provider** for the [AI SDK](https://ai-sdk.dev/docs) provides chat, image generation, transcription, and speech models through the [Inference Cooperative](https://inference.coop)'s member-governed, OpenAI-compatible gateway. Model IDs carry a provider prefix — `tinfoil/` runs in TEE enclaves for architectural privacy, `greenpt/` and `regolo/` run on 100% renewable energy in the EU.

## Setup

```bash
npm i ai @ai-sdk/inference-coop
```

## Usage

```ts
import { inferenceCoop } from '@ai-sdk/inference-coop';
import { generateText } from 'ai';

const { text } = await generateText({
  model: inferenceCoop('greenpt/deepseek-v4.1-flash'),
  prompt: 'What is the capital of France?',
});
```

See the [Inference Cooperative Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/inference-coop) for more information.
