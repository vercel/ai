import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await rerank({
    model: cohere.rerankingModel('rerank-v3.5'),
    documents: ['sunny day at the beach', 'rainy day in the city'],
    query: 'talk about rain',
    topK: 2,
  });

  print('Reranking:', result.ranking);
  print('Metadata:', result.providerMetadata);
});
