import { OpenTelemetry } from '@ai-sdk/otel';
import { embed, embedMany, registerTelemetry, rerank } from 'ai';
import { MockEmbeddingModelV4, MockRerankingModelV4 } from 'ai/test';

registerTelemetry(
  new OpenTelemetry({
    enrichSpan: ({ spanType, runtimeContext }) => {
      console.log(spanType, runtimeContext);

      return {
        'app.request_id': runtimeContext?.requestId as string | undefined,
      };
    },
  }),
);

const runtimeContext = {
  requestId: 'request-123',
  userId: 'user-123',
};

const telemetry = {
  includeRuntimeContext: {
    requestId: true,
  },
};

const embeddingModel = new MockEmbeddingModelV4({
  doEmbed: async ({ values }) => ({
    embeddings: values.map(() => [0.1, 0.2, 0.3]),
    warnings: [],
  }),
});

await embed({
  model: embeddingModel,
  value: 'hello',
  runtimeContext,
  telemetry,
});

await embedMany({
  model: embeddingModel,
  values: ['hello', 'world'],
  runtimeContext,
  telemetry,
});

await rerank({
  model: new MockRerankingModelV4({
    doRerank: async () => ({
      ranking: [{ index: 0, relevanceScore: 0.9 }],
    }),
  }),
  documents: ['hello', 'world'],
  query: 'hello',
  runtimeContext,
  telemetry,
});
