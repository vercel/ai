import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type jscodeshiftType from 'jscodeshift';
import type rawResponseTransform from '../../../../packages/codemod/src/codemods/v5/replace-rawresponse-with-response';

const requireFromCodemod = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const jscodeshift = requireFromCodemod('jscodeshift') as typeof jscodeshiftType;
const j = jscodeshift.withParser('tsx');
const transform = (
  requireFromCodemod(
    './src/codemods/v5/replace-rawresponse-with-response.ts',
  ) as {
    default: typeof rawResponseTransform;
  }
).default;

const input = `
async function run() {
  const response = 'existing';
  const { rawResponse: headers } = await generateText({});
  return [response, headers];
}
`;

async function execute(
  source: string,
  generateText: () => Promise<Record<string, string>>,
) {
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;

  return new AsyncFunction('generateText', `${source}; return run();`)(
    generateText,
  );
}

async function main() {
  const output =
    transform(
      { path: 'fixture.ts', source: input },
      {
        jscodeshift: j,
        j,
        report() {},
        stats() {},
      },
      {},
    ) ?? input;

  console.log(output);

  const before = await execute(input, async () => ({
    rawResponse: 'metadata',
  }));
  assert.deepEqual(before, ['existing', 'metadata']);

  let after: unknown;
  try {
    after = await execute(output, async () => ({ response: 'metadata' }));
  } catch (error) {
    if (
      error instanceof SyntaxError &&
      /Identifier 'response' has already been declared/.test(error.message)
    ) {
      throw new Error(
        'ISSUE_23148_REPRODUCED: migrated aliased rawResponse creates a duplicate response binding',
        { cause: error },
      );
    }
    throw error;
  }

  assert.deepEqual(
    after,
    before,
    'Migration must preserve the existing response and headers bindings',
  );
}

await main();
