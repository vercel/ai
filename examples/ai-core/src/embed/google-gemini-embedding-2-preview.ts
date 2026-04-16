import { google } from '@ai-sdk/google';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { embedding, usage } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-2-preview'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
});
