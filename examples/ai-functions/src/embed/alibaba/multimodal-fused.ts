import { alibaba, type AlibabaEmbeddingModelOptions } from '@ai-sdk/alibaba';
import { embed } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { embedding, providerMetadata, usage, warnings } = await embed({
    model: alibaba.embedding('qwen3-vl-embedding'),
    value: 'White sports shoes, lightweight and breathable.',
    providerOptions: {
      alibaba: {
        content: [
          {
            type: 'image',
            image:
              'https://dashscope.oss-cn-beijing.aliyuncs.com/images/256_1.png',
          },
        ],
        dimension: 1024,
        enableFusion: true,
      } satisfies AlibabaEmbeddingModelOptions,
    },
  });

  console.log(embedding);
  console.log(providerMetadata);
  console.log(usage);
  console.log(warnings);
});
