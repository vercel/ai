import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await embed({
    model: 'openai/text-embedding-3-small',
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
