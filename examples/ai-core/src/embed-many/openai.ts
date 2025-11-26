import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { embeddings, usage } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
  console.log(usage);
});
