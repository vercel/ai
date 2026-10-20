import { perplexity } from '@ai-sdk/perplexity';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, usage, providerMetadata, warnings } = await embed({
    model: perplexity.embedding('pplx-embed-v1-4b'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(providerMetadata?.perplexity?.cost);
  console.log(warnings);
});
