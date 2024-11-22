import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';

async function main() {
  const togetherai = createOpenAICompatible({
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
    },
  });
  const model = togetherai.textEmbeddingModel('BAAI/bge-large-en-v1.5');
  const { embeddings, usage } = await embedMany({
    model,
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
