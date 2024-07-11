import { mistral } from '@ai-sdk/mistral';
import { embed } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { embedding, usage } = await embed({
    model: mistral.embedding('mistral-embed'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
