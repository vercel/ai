import { embed } from 'ai';
import { registry } from './setup-registry';

async function main() {
  const { embedding } = await embed({
    model: registry.textEmbeddingModel('openai:text-embedding-3-small'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
}

main().catch(console.error);
