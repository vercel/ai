import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      path.join(repositoryRoot, 'packages/harness-opencode'),
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/index.test.ts',
      '-t',
      'preserves caller model limits when the bridge supplies',
    ],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );

  process.exitCode = result.status ?? 1;
}

main();
