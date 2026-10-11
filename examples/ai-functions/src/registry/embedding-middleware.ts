import assert from 'node:assert/strict';
import { createProviderRegistry, embed } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

const calls: string[][] = [];

const embeddingModel = {
  specificationVersion: 'v4' as const,
  provider: 'mock',
  modelId: 'embedding',
  maxEmbeddingsPerCall: 10,
  supportsParallelCalls: true,
  async doEmbed({ values }: { values: string[] }) {
    calls.push(values);
    return {
      embeddings: values.map(() => [1, 2, 3]),
      usage: { tokens: values.length },
      warnings: [],
    };
  },
};

const registry = createProviderRegistry(
  {
    mock: {
      specificationVersion: 'v4',
      languageModel: () => {
        throw new Error('Language models are not used in this example.');
      },
      embeddingModel: () => embeddingModel,
      imageModel: () => {
        throw new Error('Image models are not used in this example.');
      },
    },
  },
  {
    embeddingModelMiddleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) => ({
        ...params,
        values: params.values.map(value => value.toUpperCase()),
      }),
    },
  },
);

run(async () => {
  const result = await embed({
    model: registry.embeddingModel('mock:embedding'),
    value: 'shared registry middleware',
  });

  assert.deepEqual(calls[0], ['SHARED REGISTRY MIDDLEWARE']);
  print('Embedding:', result.embedding);
  print('Values received by the provider:', calls[0]);
});
