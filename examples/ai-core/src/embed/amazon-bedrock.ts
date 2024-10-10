import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage } = await embed({
    model: bedrock.embedding('amazon.titan-embed-text-v2:0'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
