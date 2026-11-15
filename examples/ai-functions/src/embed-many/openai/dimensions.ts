import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embeddings, usage, warnings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: ['sunny day at the beach', 'rainy afternoon in the city'],
    dimensions: 512,
  });

  console.log(
    'Dimensions:',
    embeddings.map(embedding => embedding.length),
  );
  console.log('Usage:', usage);
  console.log('Warnings:', warnings);
});
