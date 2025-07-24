import { createGatewayProvider } from '@ai-sdk/gateway';
import { embed } from 'ai';
import 'dotenv/config';

const gateway = createGatewayProvider({
  baseURL: 'http://localhost:3000/v1/ai',
});

async function main() {
  const result = await embed({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    value: 'sunny day at the beach',
  });

  console.log('Embedding:', result.embedding);
  console.log('Usage:', result.usage);

  if (result.providerMetadata) {
    console.log('\nProvider Metadata:');
    console.log(JSON.stringify(result.providerMetadata, null, 2));
  }
}

main().catch(console.error);
