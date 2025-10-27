import { cohere, CohereRerankingOptions } from '@ai-sdk/cohere';
import { rerank } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await rerank({
    model: cohere.rerankingModel('rerank-v3.5'),
    documents: ['sunny day at the beach', 'rainy day in the city'],
    query: 'talk about rain',
    topN: 2,
    providerOptions: {
      cohere: {
        priority: 1,
      } satisfies CohereRerankingOptions,
    },
  });

  print('Reranking:', result.ranking);
});
