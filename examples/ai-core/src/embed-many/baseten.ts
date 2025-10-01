import { createBaseten } from '@ai-sdk/baseten';
import { embedMany } from 'ai';
import 'dotenv/config';

async function main() {
  // Using Performance Client with custom model URL for batch embeddings
  // Performance Client automatically handles batching and parallel processing
  const EMBEDDING_MODEL_ID = '<model-id>'; // e.g. 03y7n6e3
  const EMBEDDING_MODEL_URL = `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;

  const baseten = createBaseten({
    modelURL: EMBEDDING_MODEL_URL,
  });

  const { embeddings, usage } = await embedMany({
    model: baseten.textEmbeddingModel(),
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
}

main().catch(console.error);
