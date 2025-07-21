import { createGatewayProvider } from '@ai-sdk/gateway';
import { embedMany } from 'ai';
import 'dotenv/config';

const gateway = createGatewayProvider();

async function main() {
  const { embeddings, usage } = await embedMany({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(embeddings);
  console.log(usage);
}

main().catch(console.error);
