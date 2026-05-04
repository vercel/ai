import { togetherai } from '@ai-sdk/togetherai';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, usage, warnings } = await embed({
    model: togetherai.embeddingModel('intfloat/multilingual-e5-large-instruct'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
