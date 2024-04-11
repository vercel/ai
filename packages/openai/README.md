# Vercel AI SDK - OpenAI Provider

The OpenAI provider contains language model support for the OpenAI chat and completion APIs.
It creates language model objects that can be used with the `generateText`, `streamText`, `generateObject`, and `streamObject` AI functions.

## Setup

The OpenAI provider is available in the `@ai-sdk/openai` module. You can install it with

```bash
npm i @ai-sdk/openai
```

## Provider Instance

You can import `OpenAI` from `ai/openai` and initialize a provider instance with various settings:

```ts
import { OpenAI } from '@ai-sdk/openai'

const openai = new OpenAI({
  baseUrl: '', // optional base URL for proxies etc.
  apiKey: '' // optional API key, default to env property OPENAI_API_KEY
  organization: '' // optional organization
})
```

The AI SDK also provides a shorthand `openai` import with an OpenAI provider instance that uses defaults:

```ts
import { openai } from '@ai-sdk/openai';
```

## Chat Models

You can create models that call the [OpenAI chat API](https://platform.openai.com/docs/api-reference/chat) using the `.chat()` factory method.
The first argument is the model id, e.g. `gpt-4`.
The OpenAI chat models support tool calls and some have multi-modal capabilities.

```ts
const model = openai.chat('gpt-3.5-turbo');
```

OpenAI chat models support also some model specific settings that are not part of the [standard call settings](/docs/ai-core/settings).
You can pass them as an options argument:

```ts
const model = openai.chat('gpt-3.5-turbo', {
  logitBias: {
    // optional likelihood for specific tokens
    '50256': -100,
  },
  user: 'test-user', // optional unique user identifier
});
```

## Completion Models

You can create models that call the [OpenAI completions API](https://platform.openai.com/docs/api-reference/completions) using the `.completion()` factory method.
The first argument is the model id.
Currently only `gpt-3.5-turbo-instruct` is supported.

```ts
const model = openai.completion('gpt-3.5-turbo-instruct');
```

OpenAI completion models support also some model specific settings that are not part of the [standard call settings](/docs/ai-core/settings).
You can pass them as an options argument:

```ts
const model = openai.chat('gpt-3.5-turbo', {
  echo: true, // optional, echo the prompt in addition to the completion
  logitBias: {
    // optional likelihood for specific tokens
    '50256': -100,
  },
  suffix: 'some text', // optional suffix that comes after a completion of inserted text
  user: 'test-user', // optional unique user identifier
});
```
