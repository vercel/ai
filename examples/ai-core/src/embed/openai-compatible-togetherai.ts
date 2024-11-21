import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed } from 'ai';

async function main() {
  const togetherai = createOpenAICompatible({
    apiKeyEnvVarName: 'TOGETHER_AI_API_KEY',
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
  });
  const model = togetherai.textEmbeddingModel('BAAI/bge-large-en-v1.5');
  const { embedding, usage } = await embed({
    model,
    value: 'sunny day at the beach',
  });

  console.log(embedding);
  console.log(usage);
}

main().catch(console.error);
