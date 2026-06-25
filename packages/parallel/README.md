# AI SDK - Parallel Provider

The **[Parallel provider](https://ai-sdk.dev/providers/ai-sdk-providers/parallel)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for Parallel's Chat API - a low latency web research API optimized for interactive workflows.

## Features

- Low latency web research optimized for interactive applications
- OpenAI ChatCompletions compatible streaming
- JSON schema response format support
- Real-time citations for accuracy and verification
- 3 second p50 TTFT (median time to first token) with streaming
- Custom system prompts for controlling AI behavior
- 300 requests per minute rate limit out of the box

## Setup

The Parallel provider is available in the `@ai-sdk/parallel` module. You can install it with:

```bash
npm i @ai-sdk/parallel
```

## Provider Instance

You can import the default provider instance `parallel` from `@ai-sdk/parallel`:

```ts
import { parallel } from '@ai-sdk/parallel';
```

## Example

```ts
import { parallel } from '@ai-sdk/parallel';
import { generateText } from 'ai';

const { text } = await generateText({
  model: parallel('speed'),
  prompt: 'What does Parallel Web Systems do?',
});
```

## Streaming Example

```ts
import { parallel } from '@ai-sdk/parallel';
import { streamText } from 'ai';

const result = await streamText({
  model: parallel('speed'),
  prompt: 'Explain quantum computing in simple terms',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Documentation

Please check out the **[Parallel provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/parallel)** for more information.

