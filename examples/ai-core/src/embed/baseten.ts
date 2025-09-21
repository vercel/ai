import { createBaseten } from '@ai-sdk/baseten';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  // Using Performance Client with custom model URL for embeddings
  // Performance Client requires /sync endpoints and handles batching automatically
  const EMBEDDING_MODEL_ID = '<model-id>'; // e.g. 03y7n6e3
  const EMBEDDING_MODEL_URL = `https://model-${EMBEDDING_MODEL_ID}.api.baseten.co/environments/production/sync`;

  const baseten = createBaseten({
    modelURL: EMBEDDING_MODEL_URL,
  });

  const { embedding, usage } = await embed({
    model: baseten.textEmbeddingModel(),
    value: 'sunny day at the beach',
  });

  console.log('Embedding dimension:', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Usage:', usage);
}

main().catch(console.error);
