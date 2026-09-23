import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { embedMany, NoEmbeddingGeneratedError } from 'ai';

const model: EmbeddingModelV4 = {
  specificationVersion: 'v4',
  provider: 'example',
  modelId: 'empty-result-model',
  maxEmbeddingsPerCall: Infinity,
  supportsParallelCalls: false,
  doEmbed: async () => ({
    embeddings: [],
    usage: { tokens: 4 },
    providerMetadata: {
      example: { requestId: 'request-123' },
    },
    response: {
      headers: { 'x-request-id': 'request-123' },
      body: { data: [] },
    },
    warnings: [],
  }),
};

try {
  await embedMany({
    model,
    values: ['sunny day', 'rainy day'],
  });
} catch (error) {
  if (!NoEmbeddingGeneratedError.isInstance(error)) {
    throw error;
  }

  console.log({
    expectedCount: error.expectedCount,
    actualCount: error.actualCount,
    values: error.values,
    usage: error.usage,
    providerMetadata: error.providerMetadata,
    responseBody: error.responses[0]?.body,
  });
}
