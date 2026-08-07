import { createBaseten } from '@ai-sdk/baseten';
import { embed } from 'ai';
import { requireEnv } from '../../lib/require-env';
import { run } from '../../lib/run';

run(async () => {
  // Embeddings need a dedicated BEI deployment, which is OpenAI-compatible, so
  // this goes over plain HTTP. Requires a /sync or /sync/v1 endpoint.
  // See ./performance-client.ts for the optional native client.
  const EMBEDDING_MODEL_ID = requireEnv('EMBEDDING_MODEL_ID'); // e.g. 03y7n6e3
  const EMBEDDING_MODEL_URL = `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;

  const baseten = createBaseten({
    modelURL: EMBEDDING_MODEL_URL,
  });

  const { embedding, usage, warnings } = await embed({
    model: baseten.embeddingModel(),
    value: 'sunny day at the beach',
  });

  console.log('Embedding dimension:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Usage:', usage);
  console.log('Warnings:', warnings);
});
