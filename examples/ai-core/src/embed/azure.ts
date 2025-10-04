import { azure } from '@ai-sdk/azure';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage } = await embed({
    model: azure.embedding('text-embedding-3-large'), // use your own deployment
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
