import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  // Nova embedding models support custom dimensions and purposes
  const { embedding, usage, warnings } = await embed({
    model: bedrock.embedding('amazon.nova-2-multimodal-embeddings-v1:0'),
    value: 'sunny day at the beach',
    providerOptions: {
      bedrock: {
        embeddingDimension: 256,
        embeddingPurpose: 'TEXT_RETRIEVAL',
        truncate: 'END',
      },
    },
  });

  console.log(`Embedding dimensions: ${embedding.length}`);
  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
