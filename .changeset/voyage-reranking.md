---
'@ai-sdk/voyage': patch
---

Add @ai-sdk/voyage provider with embedding and reranking model support for Voyage AI APIs.

**Embedding Models:**

- voyage-3.5, voyage-3.5-lite, voyage-3-large, voyage-3, voyage-3-lite
- voyage-code-3, voyage-code-2
- voyage-finance-2, voyage-multilingual-2, voyage-law-2

Supports provider options: `inputType`, `outputDimension`, `outputDtype`, `truncation`

**Reranking Models:**

- rerank-2.5, rerank-2.5-lite (recommended)
- rerank-2, rerank-2-lite, rerank-1, rerank-lite-1 (legacy)

Supports provider options: `truncation`

Example usage:

```ts
import { voyage } from '@ai-sdk/voyage';
import { embed, rerank } from 'ai';

// Embeddings
const { embedding } = await embed({
  model: voyage.embedding('voyage-3.5'),
  value: 'sunny day at the beach',
});

// Reranking
const { ranking } = await rerank({
  model: voyage.reranking('rerank-2.5'),
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  query: 'talk about rain',
  topN: 2,
});
```
