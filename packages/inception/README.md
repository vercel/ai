# AI SDK - Inception Provider

The **[Inception provider](https://ai-sdk.dev/providers/ai-sdk-providers/inception)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Inception's Mercury models](https://docs.inceptionlabs.ai/), including streaming, tool calling, reasoning effort, and structured outputs.

## Setup

```bash
npm i ai @ai-sdk/inception
```

## Usage

```ts
import { inception } from '@ai-sdk/inception';
import { generateText } from 'ai';

// Set INCEPTION_API_KEY in your environment.
const { text } = await generateText({
  model: inception('mercury-3'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [Inception Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/inception) for more information.
