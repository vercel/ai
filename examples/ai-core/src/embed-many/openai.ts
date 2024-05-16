import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
}

main().catch(console.error);
