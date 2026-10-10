import assert from 'node:assert/strict';
import { embedMany } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  let callCount = 0;

  const result = await embedMany({
    model: new MockEmbeddingModelV4({
      maxEmbeddingsPerCall: 1,
      supportsParallelCalls: false,
      doEmbed: async ({ values }) => {
        const requestNumber = ++callCount;

        return {
          embeddings: values.map(() => [requestNumber]),
          usage: { tokens: 1 },
          providerMetadata: {
            mock: { requestId: `request-${requestNumber}` },
          },
          warnings: [],
        };
      },
    }),
    values: ['first', 'second'],
  });

  const requestIds = result.calls.map(call => ({
    values: result.values.slice(call.startIndex, call.endIndex),
    requestId: call.providerMetadata?.mock?.requestId,
  }));

  assert.deepStrictEqual(requestIds, [
    { values: ['first'], requestId: 'request-1' },
    { values: ['second'], requestId: 'request-2' },
  ]);

  console.log(requestIds);
});
