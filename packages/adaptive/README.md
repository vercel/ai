# AI SDK - Adaptive Provider

The **[Adaptive provider](https://ai-sdk.dev/providers/ai-sdk-providers/adaptive)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for adaptive provider selection across multiple AI services.

## Setup

The Adaptive provider is available in the `@ai-sdk/adaptive` module. You can install it with

```bash
npm i @ai-sdk/adaptive
```

## Provider Instance

You can import the default provider instance `adaptive` from `@ai-sdk/adaptive`:

```ts
import { adaptive } from '@ai-sdk/adaptive';
```

## Example

```ts
import { adaptive } from '@ai-sdk/adaptive';
import { generateText } from 'ai';

const { text } = await generateText({
  model: adaptive('openai-gpt-4o'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Model Format

All models must be specified in `providername-modelname` format:

```ts
import { adaptive } from '@ai-sdk/adaptive';

// OpenAI models
adaptive('openai-gpt-4o');
adaptive('openai-gpt-4o-mini');

// Anthropic models
adaptive('anthropic-claude-3.5-sonnet');
adaptive('anthropic-claude-3.5-haiku');

// Google models
adaptive('google-gemini-2.5-pro');
adaptive('google-gemini-1.5-flash');

// Other providers
adaptive('deepseek-deepseek-chat');
adaptive('groq-llama-3.3-70b-versatile');
```

## Configuration

You can configure the adaptive provider with custom settings:

```ts
import { createAdaptive } from '@ai-sdk/adaptive';

const adaptive = createAdaptive({
  baseURL: 'https://your-adaptive-api.com/v1',
  apiKey: 'your-api-key',
});
```

## Documentation

Please check out the **[Adaptive provider](https://ai-sdk.dev/providers/ai-sdk-providers/adaptive)** for more information.
