import { strict as assert } from 'node:assert';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embedMany } from 'ai';

type ContentPart = { text: string };
type ContentEntry = ContentPart[] | null;

type RecordedRequest = {
  ids: number[];
  url: string;
};

class AutomaticContentCaseError extends Error {
  readonly requestCount: number;

  constructor(message: string, requestCount: number) {
    super(message);
    this.name = 'AutomaticContentCaseError';
    this.requestCount = requestCount;
  }
}

const REPRODUCTION_SIGNAL =
  'ISSUE_21095_REPRODUCED: embedMany rejected 101 aligned values/content before any HTTP request';

function getId(parts: ContentPart[]) {
  const match = /^Document (\d+)$/.exec(parts[0]?.text ?? '');
  assert.ok(match, `Missing document text in ${JSON.stringify(parts)}`);
  return Number(match[1]);
}

function createSyntheticGoogle(
  getExpectedContext: (id: number) => string | undefined = id =>
    id % 3 === 0 ? undefined : `Context ${id}`,
) {
  const requests: RecordedRequest[] = [];

  const google = createGoogleGenerativeAI({
    apiKey: 'synthetic-test-key',
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body)) as
        | { content: { parts: ContentPart[] } }
        | { requests: Array<{ content: { parts: ContentPart[] } }> };
      const contents =
        'requests' in body
          ? body.requests.map(request => request.content)
          : [body.content];

      const ids = contents.map(({ parts }) => {
        const id = getId(parts);
        assert.equal(
          parts[1]?.text,
          getExpectedContext(id),
          `Content lost index alignment for Document ${id}`,
        );
        return id;
      });

      requests.push({ ids, url: String(url) });

      if (String(url).endsWith(':embedContent')) {
        return Response.json({ embedding: { values: [ids[0]] } });
      }

      return Response.json({
        embeddings: ids.map(id => ({ values: [id] })),
      });
    },
  });

  return { google, requests };
}

function createValues(count: number) {
  return Array.from({ length: count }, (_, index) => `Document ${index}`);
}

function createContent(count: number): ContentEntry[] {
  return Array.from({ length: count }, (_, index) =>
    index % 3 === 0 ? null : [{ text: `Context ${index}` }],
  );
}

async function runAutomaticContentCase({
  count,
  maxParallelCalls,
  modelId = 'gemini-embedding-2',
}: {
  count: number;
  maxParallelCalls: number;
  modelId?: string;
}) {
  const { google, requests } = createSyntheticGoogle();
  let result;
  try {
    result = await embedMany({
      model: google.embedding(modelId),
      values: createValues(count),
      providerOptions: {
        google: {
          content: createContent(count),
        },
      },
      maxRetries: 0,
      maxParallelCalls,
    });
  } catch (error) {
    throw new AutomaticContentCaseError(
      error instanceof Error ? error.message : String(error),
      requests.length,
    );
  }

  assert.deepEqual(
    result.embeddings,
    Array.from({ length: count }, (_, index) => [index]),
    `${count} embeddings were not returned in value/content index order`,
  );
  assert.equal(requests.length, Math.ceil(count / 100));

  return requests;
}

async function runControls() {
  await runAutomaticContentCase({ count: 1, maxParallelCalls: 1 });
  await runAutomaticContentCase({ count: 99, maxParallelCalls: 1 });
  await runAutomaticContentCase({ count: 100, maxParallelCalls: 1 });

  const textOnly = createSyntheticGoogle(() => undefined);
  const textOnlyResult = await embedMany({
    model: textOnly.google.embedding('gemini-embedding-2'),
    values: createValues(101),
    maxRetries: 0,
    maxParallelCalls: 1,
  });
  assert.equal(textOnlyResult.embeddings.length, 101);
  assert.equal(textOnly.requests.length, 2);

  const manuallySliced = createSyntheticGoogle();
  const manualEmbeddings: number[][] = [];
  const values = createValues(101);
  const content = createContent(101);
  for (let start = 0; start < values.length; start += 100) {
    const result = await embedMany({
      model: manuallySliced.google.embedding('gemini-embedding-2'),
      values: values.slice(start, start + 100),
      providerOptions: {
        google: {
          content: content.slice(start, start + 100),
        },
      },
      maxRetries: 0,
      maxParallelCalls: 1,
    });
    manualEmbeddings.push(...result.embeddings);
  }
  assert.deepEqual(
    manualEmbeddings,
    Array.from({ length: 101 }, (_, index) => [index]),
  );

  const empty = createSyntheticGoogle();
  const emptyResult = await embedMany({
    model: empty.google.embedding('gemini-embedding-2'),
    values: [],
    providerOptions: { google: { content: [] } },
    maxRetries: 0,
  });
  assert.deepEqual(emptyResult.embeddings, []);
  assert.equal(empty.requests.length, 0);

  const mismatched = createSyntheticGoogle();
  await assert.rejects(
    embedMany({
      model: mismatched.google.embedding('gemini-embedding-2'),
      values: ['Document 0', 'Document 1'],
      providerOptions: { google: { content: [null] } },
      maxRetries: 0,
    }),
    new Error(
      'The number of multimodal content entries (1) must match the number of values (2).',
    ),
  );
  assert.equal(mismatched.requests.length, 0);
}

async function main() {
  await runControls();

  const cases = [
    { count: 101, maxParallelCalls: 1 },
    { count: 101, maxParallelCalls: 4 },
    { count: 200, maxParallelCalls: 1 },
    { count: 201, maxParallelCalls: 4 },
    {
      count: 101,
      maxParallelCalls: 1,
      modelId: 'gemini-embedding-2-preview',
    },
  ];

  const failures: Array<{
    count: number;
    maxParallelCalls: number;
    message: string;
    modelId: string;
    requestCount: number;
  }> = [];

  for (const testCase of cases) {
    try {
      await runAutomaticContentCase(testCase);
    } catch (error) {
      if (!(error instanceof AutomaticContentCaseError)) {
        throw error;
      }
      failures.push({
        count: testCase.count,
        maxParallelCalls: testCase.maxParallelCalls,
        message: error.message,
        modelId: testCase.modelId ?? 'gemini-embedding-2',
        requestCount: error.requestCount,
      });
    }
  }

  if (failures.length > 0) {
    assert.equal(failures.length, cases.length);
    for (const failure of failures) {
      assert.equal(failure.requestCount, 0);
      assert.equal(
        failure.message,
        `The number of multimodal content entries (${failure.count}) must match the number of values (100).`,
      );
    }
    throw new Error(REPRODUCTION_SIGNAL);
  }

  console.log(
    'Issue #21095 is fixed: automatic batches preserved all value/content pairs.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
