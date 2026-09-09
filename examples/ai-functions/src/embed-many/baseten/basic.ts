import { createBaseten } from '@ai-sdk/baseten';
import { embedMany } from 'ai';
import { requireEnv } from '../../lib/require-env';
import { run } from '../../lib/run';

run(async () => {
  // Plain HTTP against a dedicated BEI deployment. `embedMany` splits inputs
  // into chunks of 128 and runs them in parallel, so the list below could be
  // arbitrarily long.
  const EMBEDDING_MODEL_ID = requireEnv('EMBEDDING_MODEL_ID'); // e.g. 03y7n6e3
  const EMBEDDING_MODEL_URL = `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;

  const baseten = createBaseten({
    modelURL: EMBEDDING_MODEL_URL,
  });

  const { embeddings, usage, warnings } = await embedMany({
    model: baseten.embeddingModel(),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy mountain peak',
      'foggy morning in the forest',
    ],
  });

  console.log('Number of embeddings:', embeddings.length);
  console.log('Embedding dimension:', embeddings[0].length);
  console.log('First embedding (first 5 values):', embeddings[0].slice(0, 5));
  console.log('Usage:', usage);
  console.log('Warnings:', warnings);
});
