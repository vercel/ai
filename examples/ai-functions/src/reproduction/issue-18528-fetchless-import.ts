import { spawnSync } from 'node:child_process';

const packageNames = ['@ai-sdk/provider-utils', 'ai'] as const;
const reportedError =
  "TypeError: Function.prototype.toString requires that 'this' be a Function";

function importPackage({
  packageName,
  removeGlobalFetch,
}: {
  packageName: (typeof packageNames)[number];
  removeGlobalFetch: boolean;
}) {
  const source = `
    ${removeGlobalFetch ? 'delete globalThis.fetch;' : ''}
    await import(${JSON.stringify(packageName)});
  `;

  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', source],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  if (result.error != null) {
    throw result.error;
  }

  return result;
}

async function main() {
  for (const packageName of packageNames) {
    const control = importPackage({
      packageName,
      removeGlobalFetch: false,
    });

    if (control.status !== 0) {
      throw new Error(
        `Control import failed for ${packageName} while globalThis.fetch was present:\n${control.stderr}`,
      );
    }
  }

  const fetchlessFailures = packageNames.map(packageName => ({
    packageName,
    result: importPackage({
      packageName,
      removeGlobalFetch: true,
    }),
  }));

  const unexpectedResults = fetchlessFailures.filter(
    ({ result }) =>
      result.status === 0 || !result.stderr.includes(reportedError),
  );

  if (unexpectedResults.length > 0) {
    throw new Error(
      `Issue #18528 did not reproduce as reported:\n${unexpectedResults
        .map(
          ({ packageName, result }) =>
            `${packageName}: exit ${result.status}\n${result.stderr}`,
        )
        .join('\n')}`,
    );
  }

  for (const { packageName } of fetchlessFailures) {
    console.error(`${packageName}: ${reportedError}`);
  }

  console.error(
    'ISSUE #18528 REPRODUCED: importing without globalThis.fetch failed for @ai-sdk/provider-utils, ai',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
