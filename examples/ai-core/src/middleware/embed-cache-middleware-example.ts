import { openai } from '@ai-sdk/openai';
import { embed, wrapEmbeddingModel } from 'ai';
import 'dotenv/config';
import { yourEmbedCacheMiddleware } from './your-embed-cache-middleware';

async function main() {
  const modelWithCaching = wrapEmbeddingModel({
    model: openai.embedding('text-embedding-3-small'),
    middleware: yourEmbedCacheMiddleware,
  });

  const start1 = Date.now();
  const result1 = await embed({
    model: modelWithCaching,
    value: 'sunny day at the beach',
  });
  const end1 = Date.now();

  const start2 = Date.now();
  const result2 = await embed({
    model: modelWithCaching,
    value: 'sunny day at the beach',
  });
  const end2 = Date.now();

  console.log(`Time taken for result1: ${end1 - start1}ms`);
  console.log(`Time taken for result2: ${end2 - start2}ms`);

  console.log(result1.embedding === result2.embedding);
}

main().catch(console.error);
