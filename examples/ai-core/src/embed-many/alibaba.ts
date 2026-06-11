import { alibaba, type AlibabaEmbeddingModelOptions } from '@ai-sdk/alibaba';
import { embedMany } from 'ai';
import 'dotenv/config';

async function main() {
  const { embeddings, usage } = await embedMany({
    model: alibaba.textEmbeddingModel('text-embedding-v4'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
    providerOptions: {
      alibaba: {
        textType: 'document',
        dimension: 1024,
        outputType: 'dense',
      } satisfies AlibabaEmbeddingModelOptions,
    },
  });

  console.log(embeddings);
  console.log(usage);
}

main().catch(console.error);
