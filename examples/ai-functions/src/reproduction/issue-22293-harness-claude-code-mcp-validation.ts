import { spawnSync } from 'node:child_process';

async function main() {
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@ai-sdk/harness-claude-code',
      'test:node',
      'src/bridge/index.test.ts',
      '-t',
      'reports exactly one completed host-tool attempt',
    ],
    {
      cwd: new URL('../../../..', import.meta.url),
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
