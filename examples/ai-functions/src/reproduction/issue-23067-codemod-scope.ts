import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const jscodeshift = require('jscodeshift');

const input = `import { generateText } from 'ai';
function unrelated() {
  const options = { maxSteps: 99 };
  return options;
}
function generate() {
  const options = { maxSteps: 3 };
  return generateText(options);
}`;

async function main() {
  const transformerUrl = new URL(
    '../../../../packages/codemod/src/codemods/v5/move-maxsteps-to-stopwhen.ts',
    import.meta.url,
  ).href;
  const transformerModule = await import(transformerUrl);
  const transformer =
    typeof transformerModule.default === 'function'
      ? transformerModule.default
      : transformerModule.default.default;
  const j = jscodeshift.withParser('tsx');
  const output =
    transformer(
      { path: 'fixture.ts', source: input },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? input;

  const execute = new Function(
    'generateText',
    'stepCountIs',
    `${output.replace(/^import[^;]+;/gm, '')}
return { unrelated: unrelated(), generation: generate() };`,
  );
  const actual = execute(
    (options: unknown) => options,
    (count: number) => ({ count }),
  );

  const failures: string[] = [];

  try {
    assert.deepEqual(actual.unrelated, { maxSteps: 99 });
  } catch {
    failures.push(
      `unrelated options changed to ${JSON.stringify(actual.unrelated)}`,
    );
  }

  try {
    assert.deepEqual(actual.generation, { stopWhen: { count: 3 } });
  } catch {
    failures.push(
      `generateText options remained ${JSON.stringify(actual.generation)}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_23067: maxSteps codemod resolved the wrong scoped options binding',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Issue #23067 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
