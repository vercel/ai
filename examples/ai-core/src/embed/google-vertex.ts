import { vertex } from '@ai-sdk/google-vertex';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage, warnings } = await embed({
    model: vertex.embeddingModel('text-embedding-004'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
}

main().catch(console.error);
