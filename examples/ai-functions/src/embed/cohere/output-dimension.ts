import { cohere, type CohereEmbeddingModelOptions } from '@ai-sdk/cohere';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Embed 5 supports 256, 512, 768, 1024, 1536, or 2048 (default).
  const { embedding, usage, warnings } = await embed({
    model: cohere.embedding('embed-v5.0-pro'),
    value: 'sunny day at the beach',
    providerOptions: {
      cohere: {
        outputDimension: 768,
      } satisfies CohereEmbeddingModelOptions,
    },
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
