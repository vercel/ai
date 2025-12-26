import { mistral } from '@ai-sdk/mistral';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage, warnings } = await embed({
    model: mistral.embedding('mistral-embed'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
}

main().catch(console.error);
