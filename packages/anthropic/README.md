# Vercel AI SDK - Anthropic Provider

**Note: The Anthropic API does not support streaming tool calls yet.**

The Anthropic provider contains language model support for the [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post).
It creates language model objects that can be used with the `generateText` and `streamText`AI functions.

## Setup

The Anthropic provider is available in the `@ai-sdk/anthropic` module. You can install it with

```
npm i @ai-sdk/anthropic
```

## Provider Instance

You can import `createAnthropic` from `@ai-sdk/anthropic` and create a provider instance with various settings:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  // optional base URL for proxies etc.:
  baseURL: '',

  // optional API key, default to env property ANTHROPIC_API_KEY:
  apiKey: '',

  // optional custom headers:
  headers: {
    'custom-header': 'value',
  },
});
```

The AI SDK also provides a shorthand `anthropic` import with a Anthropic provider instance that uses defaults:

```ts
import { anthropic } from '@ai-sdk/anthropic';
```

## Models

You can create models that call the [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post) using the provider instance.
The first argument is the model id, e.g. `claude-3-haiku-20240307`.
Some models have multi-modal capabilities.

```ts
const model = anthropic('claude-3-haiku-20240307');
```

Anthropic Messages` models support also some model specific settings that are not part of the [standard call settings](/docs/ai-core/settings).
You can pass them as an options argument:

```ts
const model = anthropic('claude-3-haiku-20240307', {
  topK: 0.2,
});
```
