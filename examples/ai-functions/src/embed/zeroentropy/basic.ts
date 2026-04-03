import { zeroentropy } from '@ai-sdk/zeroentropy';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, usage, warnings } = await embed({
    model: zeroentropy.embedding('zembed-1'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
