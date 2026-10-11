import assert from 'node:assert/strict';
import { InvalidArgumentError, rerank, type RerankingModel } from 'ai';

type RerankingModelV4 = Extract<RerankingModel, { specificationVersion: 'v4' }>;

async function main() {
  const providerCalls: Array<{ topN: string; serialized: string }> = [];

  const model: RerankingModelV4 = {
    specificationVersion: 'v4',
    provider: 'synthetic',
    modelId: 'reranker',
    async doRerank(options) {
      providerCalls.push({
        topN: String(options.topN),
        serialized: JSON.stringify({ top_n: options.topN }),
      });

      return {
        ranking: [{ index: 0, relevanceScore: 1 }],
        warnings: [],
      };
    },
  };

  for (const topN of [undefined, 1]) {
    const result = await rerank({
      model,
      documents: ['first', 'second'],
      query: 'first',
      topN,
    });

    assert.equal(result.rerankedDocuments[0], 'first');
  }

  providerCalls.length = 0;

  const outcomes: Array<{ topN: string; result: string }> = [];
  for (const topN of [NaN, Infinity, -Infinity, -1, 1.5]) {
    try {
      await rerank({
        model,
        documents: ['first', 'second'],
        query: 'first',
        topN,
        maxRetries: 0,
      });
      outcomes.push({ topN: String(topN), result: 'accepted' });
    } catch (error) {
      outcomes.push({
        topN: String(topN),
        result: InvalidArgumentError.isInstance(error)
          ? 'InvalidArgumentError'
          : error instanceof Error
            ? error.name
            : 'unknown error',
      });
    }
  }

  let emptyDocumentsStartCalls = 0;
  let emptyDocumentsResult = 'accepted';
  try {
    await rerank({
      model,
      documents: [],
      query: 'first',
      topN: NaN,
      onStart: () => {
        emptyDocumentsStartCalls++;
      },
    });
  } catch (error) {
    emptyDocumentsResult = InvalidArgumentError.isInstance(error)
      ? 'InvalidArgumentError'
      : error instanceof Error
        ? error.name
        : 'unknown error';
  }

  const invalidInputsWereRejected = outcomes.every(
    outcome => outcome.result === 'InvalidArgumentError',
  );
  const emptyDocumentsInputWasRejectedBeforeCallbacks =
    emptyDocumentsResult === 'InvalidArgumentError' &&
    emptyDocumentsStartCalls === 0;

  console.log(
    JSON.stringify(
      {
        outcomes,
        providerCalls,
        emptyDocuments: {
          result: emptyDocumentsResult,
          onStartCalls: emptyDocumentsStartCalls,
        },
      },
      null,
      2,
    ),
  );

  if (
    !invalidInputsWereRejected ||
    providerCalls.length !== 0 ||
    !emptyDocumentsInputWasRejectedBeforeCallbacks
  ) {
    throw new Error(
      'ISSUE_23009: invalid topN values reached reranking execution instead of throwing InvalidArgumentError',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
