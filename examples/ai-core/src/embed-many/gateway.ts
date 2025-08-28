import { embedMany } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await embedMany({
    model: 'openai/text-embedding-3-large',
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
