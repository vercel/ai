import { rerank } from 'ai';
import { MockRerankingModelV4 } from 'ai/test';
import { run } from '../../lib/run';

globalThis.AI_SDK_LOG_WARNINGS = false;

run(async () => {
  const result = await rerank({
    model: new MockRerankingModelV4({
      doRerank: async () => ({
        ranking: [{ index: 0, relevanceScore: 1 }],
        warnings: [
          {
            type: 'compatibility',
            feature: 'object documents',
            details: 'Object documents are converted to strings.',
          },
        ],
      }),
    }),
    documents: [{ title: 'AI SDK' }],
    query: 'AI SDK',
  });

  console.log({
    ranking: result.ranking,
    warnings: result.warnings,
  });
});
