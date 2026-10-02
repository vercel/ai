import { spawnSync } from 'node:child_process';

async function main(): Promise<void> {
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      '../../packages/harness-codex',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/issue-21954.test.ts',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );

  process.exitCode = result.status ?? 1;
}

await main();
