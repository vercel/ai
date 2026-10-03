import { nebul } from '@ai-sdk/nebul';
import { rerank } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await rerank({
    model: nebul.rerankingModel('BAAI/bge-reranker-v2-m3'),
    documents: ['sunny day at the beach', 'rainy day in the city'],
    query: 'talk about rain',
    topN: 2,
  });

  print('Reranking:', result.ranking);
});
