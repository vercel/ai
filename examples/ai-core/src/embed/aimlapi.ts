import 'dotenv/config';
import { embed } from 'ai';
import { aimlapi } from '@ai-ml.api/aimlapi-vercel-ai';

async function main() {
  const { embedding, usage } = await embed({
    model: aimlapi.textEmbeddingModel('text-embedding-3-large'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
