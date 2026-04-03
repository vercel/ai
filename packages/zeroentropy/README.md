# @ai-sdk/zeroentropy

The **[ZeroEntropy](https://zeroentropy.dev) provider** for the [AI SDK](https://ai-sdk.dev/docs) contains embedding model support for the ZeroEntropy API.

## Setup

The ZeroEntropy provider is available in the `@ai-sdk/zeroentropy` module. You can install it with

```bash
npm i @ai-sdk/zeroentropy
```

## Provider Instance

You can import the default provider instance `zeroentropy` from `@ai-sdk/zeroentropy`:

```ts
import { zeroentropy } from '@ai-sdk/zeroentropy';
```

If you need a customized setup, you can import `createZeroEntropy` from `@ai-sdk/zeroentropy` and create a provider instance with your settings:

```ts
import { createZeroEntropy } from '@ai-sdk/zeroentropy';

const zeroentropy = createZeroEntropy({
  apiKey: process.env.ZEROENTROPY_API_KEY ?? '',
});
```

## Embedding Models

You can create models that call the [ZeroEntropy embeddings API](https://docs.zeroentropy.dev/api-reference/models/embed) using the `.embedding()` factory method.

```ts
const model = zeroentropy.embedding('zembed-1');
```

ZeroEntropy embedding models support asymmetric retrieval via the `inputType` option:

```ts
// For query embeddings (default)
const queryModel = zeroentropy.embedding('zembed-1', { inputType: 'query' });

// For document embeddings
const documentModel = zeroentropy.embedding('zembed-1', { inputType: 'document' });
```

You can use embedding models to create embeddings with the `embed` and `embedMany` functions from `ai`:

```ts
import { embed } from 'ai';
import { zeroentropy } from '@ai-sdk/zeroentropy';

const { embedding } = await embed({
  model: zeroentropy.embedding('zembed-1'),
  value: 'sunny day at the beach',
});
```

### Model & Options

| Model      | Default Dimensions |
| ---------- | ------------------ |
| `zembed-1` | 2560               |

**Options:**

- `inputType`: `'query'` (default) or `'document'` — use `'query'` for search queries and `'document'` for content being indexed
- `dimensions`: `2560` | `1280` | `640` | `320` | `160` | `80` | `40` — output vector size (defaults to `2560`)
- `latency`: `'fast'` | `'slow'` — `'fast'` targets sub-second latency; `'slow'` targets higher throughput
