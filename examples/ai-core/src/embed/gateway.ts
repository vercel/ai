import { createGatewayProvider } from '@ai-sdk/gateway';
import { embed } from 'ai';
import 'dotenv/config';

const gateway = createGatewayProvider({
  baseURL: 'http://localhost:3000/v1/ai',
});

async function main() {
  const { embedding, usage } = await embed({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error); 