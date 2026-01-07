import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { embedding, usage, warnings } = await embed({
    model: bedrock.embedding('amazon.titan-embed-text-v2:0'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
