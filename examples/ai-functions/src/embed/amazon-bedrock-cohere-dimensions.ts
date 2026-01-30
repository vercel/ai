import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  // outputDimension: 256, 512, 1024, or 1536 (default)
  const { embedding, usage, warnings } = await embed({
    model: bedrock.embedding('cohere.embed-v4:0'),
    value: 'sunny day at the beach',
    providerOptions: {
      bedrock: {
        outputDimension: 256,
      },
    },
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
