import type { JSONObject, RerankingModelV4CallOptions } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { rerank } from 'ai';
import { MockRerankingModelV4 } from 'ai/test';

const mixedCases: Array<{
  label: string;
  documents: Array<string | JSONObject>;
}> = [
  {
    label: 'string then object',
    documents: ['text', { title: 'object' }],
  },
  {
    label: 'object then string',
    documents: [{ title: 'object' }, 'text'],
  },
];

function isConsistentRequest(
  documents: RerankingModelV4CallOptions['documents'],
) {
  return documents.type === 'text'
    ? documents.values.every(value => typeof value === 'string')
    : documents.values.every(
        value =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      );
}

async function checkControls() {
  for (const control of [
    {
      input: ['first', 'second'],
      expected: { type: 'text', values: ['first', 'second'] },
    },
    {
      input: [{ title: 'first' }, { title: 'second' }],
      expected: {
        type: 'object',
        values: [{ title: 'first' }, { title: 'second' }],
      },
    },
  ] as const) {
    let request: RerankingModelV4CallOptions['documents'] | undefined;
    await rerank({
      model: new MockRerankingModelV4({
        doRerank: async options => {
          request = options.documents;
          return {
            ranking: [{ index: 0, relevanceScore: 1 }],
            warnings: [],
          };
        },
      }),
      documents: control.input as never,
      query: 'query',
    });
    assert.deepEqual(request, control.expected);
  }

  let emptyProviderCalls = 0;
  const emptyResult = await rerank({
    model: new MockRerankingModelV4({
      doRerank: async () => {
        emptyProviderCalls++;
        return { ranking: [], warnings: [] };
      },
    }),
    documents: [] as string[],
    query: 'query',
  });
  assert.equal(emptyProviderCalls, 0);
  assert.deepEqual(emptyResult.ranking, []);
}

async function currentTypesAcceptMixedDocuments() {
  const typeCheckPath = new URL(
    './.issue-22721-type-check.ts',
    import.meta.url,
  );
  await writeFile(
    typeCheckPath,
    `
import { rerank } from 'ai';

declare const model: Parameters<typeof rerank>[0]['model'];

void rerank({
  model,
  query: 'query',
  documents: ['text', { title: 'object' }],
});
void rerank({
  model,
  query: 'query',
  documents: [{ title: 'object' }, 'text'],
});
`,
  );

  try {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        typeCheckPath.pathname,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    if (result.error) {
      throw result.error;
    }
    if (result.status === null) {
      throw new Error(`TypeScript was terminated by ${result.signal}`);
    }

    return result.status === 0;
  } finally {
    await rm(typeCheckPath, { force: true });
  }
}

async function main() {
  await checkControls();

  const typesAcceptMixedDocuments = await currentTypesAcceptMixedDocuments();
  const inconsistentRequests: string[] = [];

  for (const { label, documents } of mixedCases) {
    let request: RerankingModelV4CallOptions['documents'] | undefined;
    let rejected = false;

    try {
      await rerank({
        model: new MockRerankingModelV4({
          doRerank: async options => {
            request = options.documents;
            return {
              ranking: [{ index: 0, relevanceScore: 1 }],
              warnings: [],
            };
          },
        }),
        // Keep this runtime regression runnable if the public type is tightened.
        documents: documents as never,
        query: 'query',
      });
    } catch {
      rejected = true;
    }

    if (request === undefined) {
      assert.equal(
        rejected,
        true,
        `${label}: mixed documents were neither rejected nor sent`,
      );
    } else if (!isConsistentRequest(request)) {
      inconsistentRequests.push(
        `${label}: ${request.type} request contains mixed value types`,
      );
    }
  }

  console.log(
    `TypeScript accepts both mixed document orders: ${typesAcceptMixedDocuments}`,
  );

  if (inconsistentRequests.length > 0) {
    console.error(
      'ISSUE_22721: mixed document arrays reached doRerank with inconsistent discriminators\n' +
        inconsistentRequests.map(message => `- ${message}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #22721 did not reproduce: mixed documents were rejected or normalized.',
  );
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
