import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ISSUE_SIGNAL =
  'ISSUE_20748_REPRODUCED: native compaction summary leaked or normalized completion was missing';

async function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@ai-sdk/harness-opencode',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/reproduction-20748.test.ts',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status === 0) {
    process.stdout.write(output);
    return;
  }
  if (output.includes(ISSUE_SIGNAL)) {
    process.stdout.write(output);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(output);
  process.exitCode = result.status ?? 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
