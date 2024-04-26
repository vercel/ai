# Vercel AI SDK - Anthropic Provider

The [Anthropic](https://www.anthropic.com/) provider for the [Vercel AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post).
It creates language model objects that can be used with the `generateText`, `streamText` and `generateObject` AI functions.

> **Note: The Anthropic API does not support streaming tool calls.**

## Setup

The Anthropic provider is available in the `@ai-sdk/anthropic` module. You can install it with

```
npm i @ai-sdk/anthropic
```

## Provider Instance

You can import the default provider instance `anthropic` from `@ai-sdk/anthropic`:

```ts
import { anthropic } from '@ai-sdk/anthropic';
```

If you need a customized setup, you can import `createAnthropic` from `@ai-sdk/anthropic` and create a provider instance with your settings:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  // custom settings
});
```

You can use the following optional settings to customize the Google Generative AI provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls, e.g. to use proxy servers.
  The default prefix is `https://api.anthropic.com/v1`.

- **apiKey** _string_

  API key that is being send using the `x-api-key` header.
  It defaults to the `ANTHROPIC_API_KEY` environment variable.

- **headers** _Record<string,string>_

  Custom headers to include in the requests.

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

The following optional settings are available for Anthropic models:

- **topK** _number_

  Only sample from the top K options for each subsequent token.

  Used to remove "long tail" low probability responses.
  Recommended for advanced use cases only. You usually only need to use temperature.
