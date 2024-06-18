import { azure } from '@ai-sdk/azure';
import { embedMany } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { embeddings } = await embedMany({
    model: azure.embedding('my-embedding-deployment'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
}

main().catch(console.error);
