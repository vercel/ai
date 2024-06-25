import { azure } from '@ai-sdk/azure';
import { embed } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { embedding } = await embed({
    model: azure.embedding('my-embedding-deployment'),
    value: 'sunny day at the beach',
  });
  console.log(embedding);
}

main().catch(console.error);
