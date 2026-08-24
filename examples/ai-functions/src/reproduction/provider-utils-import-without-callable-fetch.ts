import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const reportedError =
  "TypeError: Function.prototype.toString requires that 'this' be a Function";

async function main() {
  const packageConsumerDirectory = fileURLToPath(
    new URL('../../../../packages/ai/', import.meta.url),
  );
  const cases = [
    { name: 'undefined', value: 'undefined' },
    { name: 'a non-callable object', value: '({})' },
  ];
  const importFailures: string[] = [];

  for (const testCase of cases) {
    const result = spawnSync(
      process.execPath,
      [
        '--no-warnings',
        '--input-type=module',
        '--eval',
        `globalThis.fetch = ${testCase.value}; await import('@ai-sdk/provider-utils');`,
      ],
      {
        cwd: packageConsumerDirectory,
        encoding: 'utf8',
      },
    );

    if (result.status === 0) {
      console.log(`PASS: import succeeded with fetch set to ${testCase.name}`);
      continue;
    }

    if (!result.stderr.includes(reportedError)) {
      throw new Error(
        `Unexpected import failure with fetch set to ${testCase.name}:\n${result.stderr}`,
      );
    }

    importFailures.push(testCase.name);
  }

  if (importFailures.length > 0) {
    console.error(
      `ISSUE_19421_REPRODUCED: @ai-sdk/provider-utils import threw at module evaluation with globalThis.fetch set to ${importFailures.join(
        ' and ',
      )}`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
