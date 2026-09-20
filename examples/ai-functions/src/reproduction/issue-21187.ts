import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = fileURLToPath(
    new URL('../../../../', import.meta.url),
  );
  const packageDirectory = fileURLToPath(
    new URL('../../../../packages/harness-opencode/', import.meta.url),
  );
  const testPath = 'src/bridge/issue-21187.reproduction.test.ts';

  const result = spawnSync(
    'pnpm',
    [
      '-C',
      packageDirectory,
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      testPath,
    ],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
