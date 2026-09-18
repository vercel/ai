import { nebul } from '@ai-sdk/nebul';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, usage } = await embed({
    model: nebul.embeddingModel('sentence-transformers/all-MiniLM-L6-v2'),
    value: 'sunny day at the beach',
  });

  console.log('Embedding dimension:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Token usage:', usage);
});
