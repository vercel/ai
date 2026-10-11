import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

type CodemodTransform = (
  file: { path: string; source: string },
  api: {
    jscodeshift: unknown;
    j: unknown;
    stats: () => void;
    report: (message: string) => void;
  },
  options: Record<string, never>,
) => Promise<string | null | undefined> | string | null | undefined;

const requireFromCodemod = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const transform = requireFromCodemod(
  './src/codemods/v7/replace-reasoning-tokens.ts',
).default as CodemodTransform;
const jscodeshift = requireFromCodemod('jscodeshift').withParser('tsx');

async function transformSource(source: string) {
  return (
    (await transform(
      { path: 'fixture.ts', source },
      {
        jscodeshift,
        j: jscodeshift,
        stats() {},
        report() {},
      },
      {},
    )) ?? source
  );
}

function execute(source: string) {
  try {
    return {
      threw: false,
      value: runInNewContext(source, {
        usage: { outputTokenDetails: { reasoningTokens: 7 } },
      }),
    };
  } catch {
    return { threw: true, value: undefined };
  }
}

async function main() {
  const oldAccess = 'usage.reasoningTokens';
  const once = await transformSource(oldAccess);
  const twice = await transformSource(once);

  const migratedAccess = 'usage.outputTokenDetails.reasoningTokens';
  const migratedAfterTransform = await transformSource(migratedAccess);

  const onceExecution = execute(once);
  const twiceExecution = execute(twice);
  const migratedExecution = execute(migratedAfterTransform);

  const observed = {
    firstMigrationReadsReasoningTokens:
      !onceExecution.threw && onceExecution.value === 7,
    rerunIsIdempotent: twice === once,
    rerunReadsReasoningTokens:
      !twiceExecution.threw && twiceExecution.value === 7,
    migratedInputIsUnchanged: migratedAfterTransform === migratedAccess,
    migratedInputReadsReasoningTokens:
      !migratedExecution.threw && migratedExecution.value === 7,
  };

  console.log({ once, twice, migratedAfterTransform, observed });

  assert.deepEqual(
    observed,
    {
      firstMigrationReadsReasoningTokens: true,
      rerunIsIdempotent: true,
      rerunReadsReasoningTokens: true,
      migratedInputIsUnchanged: true,
      migratedInputReadsReasoningTokens: true,
    },
    'Issue #23014 reproduced: the v7 reasoning-token codemod must preserve executable, already migrated accesses',
  );
}

await main();
