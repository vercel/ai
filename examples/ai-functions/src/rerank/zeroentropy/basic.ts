import {
  zeroentropy,
  type ZeroEntropyRerankingModelOptions,
} from '@ai-sdk/zeroentropy';
import { rerank } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await rerank({
    model: zeroentropy.rerankingModel('zerank-2'),
    documents: ['sunny day at the beach', 'rainy day in the city'],
    query: 'talk about rain',
    topN: 2,
    providerOptions: {
      zeroentropy: {
        latency: 'fast',
      } satisfies ZeroEntropyRerankingModelOptions,
    },
  });

  print('Reranking:', result.ranking);
});
