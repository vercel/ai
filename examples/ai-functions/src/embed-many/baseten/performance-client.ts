import { createBaseten } from '@ai-sdk/baseten';
import { PerformanceClient } from '@basetenlabs/performance-client';
import { embedMany } from 'ai';
import { requireEnv } from '../../lib/require-env';
import { run } from '../../lib/run';

/**
 * Opting in to Baseten's native performance client for embeddings.
 *
 * The default path (./basic.ts) is plain HTTP against the deployment's
 * OpenAI-compatible endpoint, which needs no extra packages. This client adds
 * client-side batching and request hedging on top, at the cost of a native
 * addon: install `@basetenlabs/performance-client` yourself, and note it cannot
 * load in edge runtimes and bundlers cannot resolve its platform binaries.
 *
 * Because the client batches internally, values are sent in one call instead of
 * being split into chunks of 128.
 */

run(async () => {
  const EMBEDDING_MODEL_ID = requireEnv('EMBEDDING_MODEL_ID'); // e.g. 03y7n6e3
  const EMBEDDING_MODEL_URL = `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;

  const baseten = createBaseten({
    modelURL: EMBEDDING_MODEL_URL,
    performanceClient: PerformanceClient,
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
