import { cohere } from '@ai-sdk/cohere';
import { experimental_rerank as rerank } from 'ai';
import 'dotenv/config';

async function main() {
  const { usage, rerankedDocuments } = await rerank({
    model: cohere.rerankingModel('rerank-v3.5'),
    values: ['sunny day at the beach', 'rainy day in the city'],
    query: 'talk about rain',
    topK: 2,
  });

  console.log('Reranked Documents:');
  console.log(rerankedDocuments);

  console.log('Usage:');
  console.log(usage);
}

main().catch(console.error);
