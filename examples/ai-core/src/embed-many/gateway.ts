import { createGatewayProvider } from '@ai-sdk/gateway';
import { embedMany } from 'ai';
import 'dotenv/config';

const gateway = createGatewayProvider({
  baseURL: 'http://localhost:3000/v1/ai',
});

async function main() {
  const result = await embedMany({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log('Embeddings:', result.embeddings);
  console.log('Usage:', result.usage);

  if (result.providerMetadata) {
    console.log('\nProvider Metadata:');
    console.log(JSON.stringify(result.providerMetadata, null, 2));
  }
}

main().catch(console.error);
