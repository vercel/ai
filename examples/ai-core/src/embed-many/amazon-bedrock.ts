import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embedMany } from 'ai';
import 'dotenv/config';

async function main() {
  const { embeddings, usage, warnings } = await embedMany({
    model: bedrock.embedding('amazon.titan-embed-text-v2:0'),
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
