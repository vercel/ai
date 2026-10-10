import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { serializeModelOptions, type Resolvable } from '@ai-sdk/provider-utils';

type Headers = Record<string, string | undefined>;

const expectedHeaders: Headers = {
  'x-request-id': 'fixture',
};

const thenable = {
  // oxlint-disable-next-line unicorn/no-thenable -- Reproduce PromiseLike header handling.
  then(resolve: (headers: Headers) => unknown) {
    return Promise.resolve(resolve(expectedHeaders));
  },
} as PromiseLike<Headers>;

const crossRealmPromise = runInNewContext(
  'Promise.resolve({ "x-request-id": "fixture" })',
) as PromiseLike<Headers>;

function serializeHeaders(headers: Resolvable<Headers>) {
  return serializeModelOptions({
    modelId: 'mock',
    config: { headers },
  });
}

async function main() {
  assert.deepEqual(
    serializeHeaders(expectedHeaders).config.headers,
    expectedHeaders,
  );
  assert.deepEqual(
    serializeHeaders(() => expectedHeaders).config.headers,
    expectedHeaders,
  );

  const cases: Array<[name: string, headers: Resolvable<Headers>]> = [
    ['native Promise', Promise.resolve(expectedHeaders)],
    ['native Promise factory', () => Promise.resolve(expectedHeaders)],
    ['thenable', thenable],
    ['thenable factory', () => thenable],
    ['cross-realm Promise', crossRealmPromise],
    ['cross-realm Promise factory', () => crossRealmPromise],
  ];

  const outcomes = cases.map(([name, headers]) => {
    try {
      return {
        name,
        result: serializeHeaders(headers),
      };
    } catch (error) {
      return {
        name,
        errorName: error instanceof Error ? error.name : String(error),
      };
    }
  });

  console.log(JSON.stringify(outcomes, null, 2));

  const failures = outcomes.filter(
    outcome => outcome.errorName !== 'AI_SerializationError',
  );

  if (failures.length > 0) {
    throw new Error(
      'BUG: serializeModelOptions silently dropped PromiseLike headers instead of rejecting every asynchronous value with AI_SerializationError',
    );
  }
}

main();
