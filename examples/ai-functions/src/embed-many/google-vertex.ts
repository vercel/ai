import { vertex } from '@ai-sdk/google-vertex';
import { embedMany } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { embeddings, usage, warnings } = await embedMany({
    model: vertex.embeddingModel('text-embedding-004'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
  console.log(usage);
  console.log(warnings);
});
