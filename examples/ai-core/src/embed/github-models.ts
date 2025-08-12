import { githubModels } from '@ai-sdk/github-models';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, usage } = await embed({
    model: githubModels.textEmbeddingModel('openai/text-embedding-3-small'),
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
