import 'dotenv/config';
import { embedMany } from 'ai';
import { aimlapi } from '@ai-ml.api/aimlapi-vercel-ai';

async function main() {
  const { embeddings, usage } = await embedMany({
    model: aimlapi.textEmbeddingModel('text-embedding-3-large'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
  console.log(usage);
}

main().catch(console.error);
