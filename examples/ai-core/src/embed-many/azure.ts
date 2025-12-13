import { azure } from '@ai-sdk/azure';
import { embedMany } from 'ai';
import 'dotenv/config';

async function main() {
  const { embeddings, usage, warnings } = await embedMany({
    model: azure.embedding('text-embedding-3-large'), // use your own deployment
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
  console.log(usage);
  console.log(warnings);
}

main().catch(console.error);
