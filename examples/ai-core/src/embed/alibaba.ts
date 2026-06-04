import { alibaba, type AlibabaEmbeddingModelOptions } from '@ai-sdk/alibaba';
import { embed } from 'ai';
import 'dotenv/config';

async function main() {
  const { embedding, providerMetadata, usage } = await embed({
    model: alibaba.textEmbeddingModel('text-embedding-v4'),
    value: 'sunny day at the beach',
    providerOptions: {
      alibaba: {
        textType: 'document',
        dimension: 1024,
        outputType: 'dense',
      } satisfies AlibabaEmbeddingModelOptions,
    },
  });

  console.log(embedding);
  console.log(providerMetadata?.alibaba?.sparseEmbeddings);
  console.log(usage);
}

main().catch(console.error);
