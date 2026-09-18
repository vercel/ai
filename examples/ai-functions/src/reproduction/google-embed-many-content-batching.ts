import { createGoogle } from '@ai-sdk/google';
import assert from 'node:assert/strict';
import { embedMany } from 'ai';

type ContentPart = { text: string };

function embeddingForParts(parts: ContentPart[]) {
  const documentMatch = /^Document (\d+)$/.exec(parts[0]?.text ?? '');
  assert.ok(documentMatch, 'request must retain the original document text');

  const index = Number(documentMatch[1]);
  const expectedAdditionalParts =
    index % 3 === 0 ? [] : [{ text: `Context ${index}` }];

  assert.deepEqual(
    parts.slice(1),
    expectedAdditionalParts,
    'request must preserve value/content index alignment, including null entries',
  );

  return [index, parts.length];
}

async function main() {
  const count = 101;
  let requests = 0;

  const google = createGoogle({
    apiKey: 'synthetic-test-key',
    fetch: async (_url, init) => {
      requests++;

      const body = (await new Response(init?.body).json()) as
        | { content: { parts: ContentPart[] } }
        | { requests: Array<{ content: { parts: ContentPart[] } }> };

      if ('content' in body) {
        return Response.json({
          embedding: { values: embeddingForParts(body.content.parts) },
        });
      }

      return Response.json({
        embeddings: body.requests.map(request => ({
          values: embeddingForParts(request.content.parts),
        })),
      });
    },
  });

  try {
    const result = await embedMany({
      model: google.embedding('gemini-embedding-2'),
      values: Array.from({ length: count }, (_, index) => `Document ${index}`),
      providerOptions: {
        google: {
          content: Array.from({ length: count }, (_, index) =>
            index % 3 === 0 ? null : [{ text: `Context ${index}` }],
          ),
        },
      },
      maxRetries: 0,
      maxParallelCalls: 1,
    });

    assert.deepEqual(
      result.embeddings,
      Array.from({ length: count }, (_, index) => [
        index,
        index % 3 === 0 ? 1 : 2,
      ]),
      'embedMany must return all embeddings in value/content index order',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      requests === 0 &&
      message ===
        'The number of multimodal content entries (101) must match the number of values (100).'
    ) {
      console.error(
        'ISSUE_21095_REPRODUCED: matching 101-entry content was rejected against a 100-value batch before any HTTP request',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
