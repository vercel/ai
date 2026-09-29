import { createBaseten } from '@ai-sdk/baseten';
import { PerformanceClient } from '@basetenlabs/performance-client';
import { embed } from 'ai';
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

  const { embedding, usage, warnings } = await embed({
    model: baseten.embeddingModel(),
    value: 'sunny day at the beach',
  });

  console.log('Embedding dimension:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Usage:', usage);
  console.log('Warnings:', warnings);
});
