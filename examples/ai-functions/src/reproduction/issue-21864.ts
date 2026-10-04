import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const testPath = 'src/bridge/task-notification-result.reproduction.test.ts';
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@ai-sdk/harness-claude-code',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      testPath,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
    },
  );

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  if (result.status === 0) {
    console.log(
      'Issue #21864 did not reproduce: the host turn waited for and emitted DONE.',
    );
    return;
  }

  if (
    result.status === 1 &&
    output.includes("expected '' to be 'DONE' // Object.is equality")
  ) {
    console.error(
      'ISSUE_REPRODUCED: task-notification result ended the host turn with empty text before DONE',
    );
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `Reproduction harness failed unexpectedly with exit code ${result.status ?? 'null'}.`,
  );
}

await main();
