---
title: Perplexity
description: Learn how to use Perplexity's Sonar API with the AI SDK.
---

# Perplexity Provider

The [Perplexity](https://sonar.perplexity.ai) provider offers access to Sonar API - a language model that uniquely combines real-time web search with natural language processing. Each response is grounded in current web data and includes detailed citations, making it ideal for research, fact-checking, and obtaining up-to-date information.

API keys can be obtained from the [Perplexity Platform](https://docs.perplexity.ai).

## Setup

The Perplexity provider is available via the `@ai-sdk/perplexity` module. You can install it with:

<InstallPackages packages="@ai-sdk/perplexity" />

## Provider Instance

You can import the default provider instance `perplexity` from `@ai-sdk/perplexity`:

```ts
import { perplexity } from '@ai-sdk/perplexity';
```

For custom configuration, you can import `createPerplexity` and create a provider instance with your settings:

```ts
import { createPerplexity } from '@ai-sdk/perplexity';

const perplexity = createPerplexity({
  apiKey: process.env.PERPLEXITY_API_KEY ?? '',
});
```

You can use the following optional settings to customize the Perplexity provider instance:

- **baseURL** _string_

  Use a different URL prefix for API calls.
  The default prefix is `https://api.perplexity.ai`.

- **apiKey** _string_

  API key that is being sent using the `Authorization` header. It defaults to
  the `PERPLEXITY_API_KEY` environment variable.

- **headers** _Record&lt;string,string&gt;_

  Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise&lt;Response&gt;_

  Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.

## Language Models

You can create Perplexity models using a provider instance:

```ts
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

const { text } = await generateText({
  model: perplexity('sonar-pro'),
  prompt: 'What are the latest developments in quantum computing?',
});
```

### Sources

Websites that have been used to generate the response are included in the `sources` property of the result:

```ts
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

const { text, sources } = await generateText({
  model: perplexity('sonar-pro'),
  prompt: 'What are the latest developments in quantum computing?',
});

console.log(sources);
```

### Provider Options & Metadata

The Perplexity provider includes additional metadata in the response through `providerMetadata`.
Additional configuration options are available through `providerOptions`.

```ts
import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateText } from 'ai';

const result = await generateText({
  model: perplexity('sonar-pro'),
  prompt: 'What are the latest developments in quantum computing?',
  providerOptions: {
    perplexity: {
      return_images: true, // Enable image responses (Tier-2 Perplexity users only)
      search_recency_filter: 'week', // Filter search results by recency
    } satisfies PerplexityLanguageModelOptions,
  },
});

console.log(result.providerMetadata);
// Example output:
// {
//   perplexity: {
//     usage: { citationTokens: 5286, numSearchQueries: 1 },
//     images: [
//       { imageUrl: "https://example.com/image1.jpg", originUrl: "https://elsewhere.com/page1", height: 1280, width: 720 },
//       { imageUrl: "https://example.com/image2.jpg", originUrl: "https://elsewhere.com/page2", height: 1280, width: 720 }
//     ]
//   },
// }
```

#### Provider Options

The following provider-specific options are available:

- **return_images** _boolean_

  Enable image responses. When set to `true`, the response may include relevant images. This feature is only available to Perplexity Tier-2 users and above.

- **search_recency_filter** _string_

  Filter search results by recency. Possible values: `'hour'`, `'day'`, `'week'`, `'month'`, `'year'`. If not specified, defaults to all time.

<Note>
  Any other [Perplexity API
  parameters](https://docs.perplexity.ai/api-reference/chat-completions) can
  also be passed through `providerOptions.perplexity`.
</Note>

#### Provider Metadata

The response metadata includes:

- `usage`: Object containing `citationTokens` and `numSearchQueries` metrics
- `images`: Array of image objects when `return_images` is enabled (Tier-2 users only). Each image contains `imageUrl`, `originUrl`, `height`, and `width`.

### PDF Support

The Perplexity provider supports reading PDF files.
You can pass PDF files as part of the message content using the `file` type:

```ts
const result = await generateText({
  model: perplexity('sonar-pro'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is this document about?',
        },
        {
          type: 'file',
          data: fs.readFileSync('./data/ai.pdf'),
          mediaType: 'application/pdf',
          filename: 'ai.pdf', // optional
        },
      ],
    },
  ],
});
```

You can also pass the URL of a PDF:

```ts
{
  type: 'file',
  data: new URL('https://example.com/document.pdf'),
  mediaType: 'application/pdf',
  filename: 'document.pdf', // optional
}
```

The model will have access to the contents of the PDF file and
respond to questions about it.

<Note>
  For more details about Perplexity's capabilities, see the [Perplexity chat
  completion docs](https://docs.perplexity.ai/api-reference/chat-completions).
</Note>

## Embedding Models

You can create models that call the [Perplexity embeddings API](https://docs.perplexity.ai/docs/embeddings/quickstart)
using the `.embedding()` factory method.

```ts
import { perplexity } from '@ai-sdk/perplexity';
import { embed } from 'ai';

const { embedding } = await embed({
  model: perplexity.embedding('pplx-embed-v1-4b'),
  value: 'sunny day at the beach',
});
```

<Note>
  Perplexity returns **quantized** embeddings (not floating point). Values are
  decoded to numbers — signed `int8` values (default) or packed bits per byte.
  Compare `base64_int8` embeddings with cosine similarity and `base64_binary`
  embeddings with Hamming distance.
</Note>

When the API returns a cost breakdown, it is exposed via
`providerMetadata.perplexity.cost` (`inputCost`, `totalCost`, `currency`):

```ts
const { embedding, providerMetadata } = await embed({
  model: perplexity.embedding('pplx-embed-v1-4b'),
  value: 'sunny day at the beach',
});

console.log(providerMetadata?.perplexity?.cost);
// { inputCost: 0.0001, totalCost: 0.0001, currency: 'USD' }
```

### Provider Options

You can pass provider-specific options via the `providerOptions.perplexity` field:

```ts
const { embedding } = await embed({
  model: perplexity.embedding('pplx-embed-v1-4b'),
  value: 'sunny day at the beach',
  providerOptions: {
    perplexity: {
      // Matryoshka truncation of the output vector (128 up to the model size).
      dimensions: 512,
      // Quantized encoding format. Defaults to 'base64_int8'.
      encodingFormat: 'base64_int8',
    },
  },
});
```

The following optional provider options are available for embedding models:

- **dimensions** _number_

  The number of dimensions the resulting output embeddings should have.
  Ranges from 128 up to the model's full size (1024 for `0.6b` models, 2560 for
  `4b` models).

- **encodingFormat** _'base64_int8' | 'base64_binary'_

  The quantized encoding format returned by the API. Defaults to `base64_int8`.

### Embedding Model Capabilities

| Model                | Dimensions | Max Values Per Call |
| -------------------- | ---------- | ------------------- |
| `pplx-embed-v1-0.6b` | 1024       | 512                 |
| `pplx-embed-v1-4b`   | 2560       | 512                 |

## Model Capabilities

| Model                 | Image Input | Object Generation | Tool Usage | Tool Streaming |
| --------------------- | ----------- | ----------------- | ---------- | -------------- |
| `sonar-deep-research` | <Cross />   | <Check />         | <Cross />  | <Cross />      |
| `sonar-reasoning-pro` | <Check />   | <Check />         | <Cross />  | <Cross />      |
| `sonar-reasoning`     | <Check />   | <Check />         | <Cross />  | <Cross />      |
| `sonar-pro`           | <Check />   | <Check />         | <Cross />  | <Cross />      |
| `sonar`               | <Check />   | <Check />         | <Cross />  | <Cross />      |

<Note>
  Please see the [Perplexity docs](https://docs.perplexity.ai) for detailed API
  documentation and the latest updates.
</Note>
