import { cohere } from '@ai-sdk/cohere';
import { experimental_rerank as rerank } from 'ai';
import 'dotenv/config';

async function main() {
  const { rerankedIndices, usage, rerankedDocuments } = await rerank({
    model: cohere.rerankingModel('rerank-v3.5'),
    values: ['sunny day at the beach', 'rainy day in the city'],
    query: 'rainy day',
    topK: 1,
    returnDocuments: true,
  });

  console.log('Reranked Indices:');
  console.log(rerankedIndices);

  console.log('Reranked Documents:');
  console.log(rerankedDocuments);

  console.log('Usage:');
  console.log(usage);
}

main().catch(console.error);
