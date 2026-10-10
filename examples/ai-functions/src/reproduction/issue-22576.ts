import { spawnSync } from 'node:child_process';

async function main() {
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      '../../packages/svelte',
      'exec',
      'vitest',
      'run',
      'src/reproduction/issue-22576.svelte.test.ts',
    ],
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  process.exit(result.status ?? 1);
}

await main();
