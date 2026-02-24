import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { embedding, usage, warnings } = await embed({
    model: bedrock.embedding('cohere.embed-english-v3'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
