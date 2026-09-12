import { rerank } from 'ai';
import { MockRerankingModelV3 } from 'ai/test';

const documents = ['a', 'b', 'c'];
const invalidIndices = [3, -1, 5, 1.5];
const failureSignal =
  'ISSUE_20421_REPRODUCED: rerank() resolved invalid provider ranking indices with undefined documents';

async function main() {
  const invalidResults: Array<{
    index: number;
    calls: number;
    rankingLength: number;
    rerankedDocumentsLength: number;
    hasUndefinedRankingDocument: boolean;
    hasUndefinedRerankedDocument: boolean;
    rankingDocument: string | undefined;
    rerankedDocument: string | undefined;
  }> = [];

  for (const index of invalidIndices) {
    let calls = 0;

    const model = new MockRerankingModelV3({
      doRerank: async () => {
        calls++;
        return {
          ranking: [{ index, relevanceScore: 0.9 }],
        };
      },
    });

    try {
      const result = await rerank({
        model,
        documents,
        query: 'q',
      });

      invalidResults.push({
        index,
        calls,
        rankingLength: result.ranking.length,
        rerankedDocumentsLength: result.rerankedDocuments.length,
        hasUndefinedRankingDocument:
          result.ranking.length > 0 &&
          result.ranking[0]?.document === undefined,
        hasUndefinedRerankedDocument:
          result.rerankedDocuments.length > 0 &&
          result.rerankedDocuments[0] === undefined,
        rankingDocument: result.ranking[0]?.document,
        rerankedDocument: result.rerankedDocuments[0],
      });
    } catch {
      // Rejecting a malformed successful provider response is valid fixed behavior.
    }
  }

  let controlCalls = 0;
  const control = await rerank({
    model: new MockRerankingModelV3({
      doRerank: async () => {
        controlCalls++;
        return {
          ranking: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.8 },
          ],
        };
      },
    }),
    documents,
    query: 'q',
  });

  if (
    controlCalls !== 1 ||
    control.rerankedDocuments.length !== 2 ||
    control.rerankedDocuments[0] !== 'c' ||
    control.rerankedDocuments[1] !== 'a'
  ) {
    throw new Error('Valid reranking control did not return ["c", "a"].');
  }

  const reproducedCases = invalidResults.filter(
    result =>
      result.calls === 1 &&
      result.hasUndefinedRankingDocument &&
      result.hasUndefinedRerankedDocument,
  );

  if (reproducedCases.length > 0) {
    console.error(
      JSON.stringify(
        {
          invalidResults,
          control: {
            calls: controlCalls,
            rerankedDocuments: control.rerankedDocuments,
          },
        },
        null,
        2,
      ),
    );
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
