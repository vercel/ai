import { hypermode } from '@ai-sdk/hypermode';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage } = await embed({
    model: hypermode.embedding('nomic-ai/nomic-embed-text-v1.5'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
