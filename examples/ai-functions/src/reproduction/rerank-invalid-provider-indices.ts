import assert from 'node:assert/strict';
import { rerank } from 'ai';
import { MockRerankingModelV4 } from 'ai/test';

const documents = ['a', 'b', 'c'];
const invalidIndices = [3, -1, 5, 1.5];

async function main() {
  const control = await rerank({
    model: new MockRerankingModelV4({
      doRerank: async () => ({
        ranking: [
          { index: 2, relevanceScore: 0.9 },
          { index: 0, relevanceScore: 0.8 },
        ],
      }),
    }),
    documents,
    query: 'q',
  });

  assert.deepEqual(
    control.rerankedDocuments,
    ['c', 'a'],
    'Valid provider ranking indices must still map to the original documents.',
  );

  const undefinedDocumentObservations: Array<{
    index: number;
    outcome: 'resolved' | 'rejected';
    rankingDocumentIsUndefined: boolean;
    rerankedDocumentIsUndefined: boolean;
    doRerankCalls: number;
    onEndCalls: number;
    onEndDocumentIsUndefined: boolean;
  }> = [];

  for (const index of invalidIndices) {
    let doRerankCalls = 0;
    let onEndCalls = 0;
    let onEndDocument: string | undefined;
    let outcome: 'resolved' | 'rejected' = 'rejected';
    let rankingDocumentIsUndefined = false;
    let rerankedDocumentIsUndefined = false;

    try {
      const result = await rerank({
        model: new MockRerankingModelV4({
          doRerank: async () => {
            doRerankCalls++;
            return {
              ranking: [{ index, relevanceScore: 0.9 }],
            };
          },
        }),
        documents,
        query: 'q',
        onEnd: event => {
          onEndCalls++;
          onEndDocument = event.ranking[0]?.document as string | undefined;
        },
      });

      outcome = 'resolved';
      rankingDocumentIsUndefined = result.ranking[0]?.document === undefined;
      rerankedDocumentIsUndefined = result.rerankedDocuments[0] === undefined;
    } catch {
      // A rejected malformed provider response does not violate the result type.
    }

    if (
      rankingDocumentIsUndefined ||
      rerankedDocumentIsUndefined ||
      (onEndCalls > 0 && onEndDocument === undefined)
    ) {
      undefinedDocumentObservations.push({
        index,
        outcome,
        rankingDocumentIsUndefined,
        rerankedDocumentIsUndefined,
        doRerankCalls,
        onEndCalls,
        onEndDocumentIsUndefined: onEndDocument === undefined,
      });
    }
  }

  if (undefinedDocumentObservations.length > 0) {
    console.error(
      'ISSUE #20421 REPRODUCED: rerank() exposed undefined documents in successful results/end events for invalid provider ranking indices.',
    );
    console.error(JSON.stringify(undefinedDocumentObservations, null, 2));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
