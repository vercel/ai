import { spawnSync } from 'node:child_process';

async function main() {
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      '../../packages/harness-claude-code',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/index.test.ts',
      '-t',
      'surfaces API errors carried by success result frames',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

await main();
