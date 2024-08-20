import { google } from '@ai-sdk/google';
import { embed } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { embedding, usage } = await embed({
    model: google.embedding('text-embedding-004'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
