# Vercel AI SDK - Google Provider

The Google provider contains language model support for the [Google Generative AI](https://ai.google/discover/generativeai/) APIs.
It creates language model objects that can be used with the `generateText`, `streamText`, `generateObject`, and `streamObject` AI functions.

## Setup

The Google provider is available in the `@ai-sdk/google` module. You can install it with

npm i @ai-sdk/google

## Provider Instance

You can import `Google` from `ai/google` and initialize a provider instance with various settings:

```ts
import { Google } from '@ai-sdk/google';

const google = new Google({
  baseUrl: '', // optional base URL for proxies etc.
  apiKey: '', // optional API key, default to env property GOOGLE_GENERATIVE_AI_API_KEY
});
```

The AI SDK also provides a shorthand `google` import with a Google provider instance that uses defaults:

```ts
import { google } from '@ai-sdk/google';
```

## Generative AI Models

You can create models that call the [Google Generative AI API](https://ai.google.dev/api/rest) using the `.generativeAI()` factory method.
The first argument is the model id, e.g. `models/gemini-pro`.
The models support tool calls and some have multi-modal capabilities.

```ts
const model = google.generativeAI('models/gemini-pro');
```

Google Generative AI models support also some model specific settings that are not part of the [standard call settings](/docs/ai-core/settings).
You can pass them as an options argument:

```ts
const model = google.generativeAI('models/gemini-pro', {
  topK: 0.2,
});
```
