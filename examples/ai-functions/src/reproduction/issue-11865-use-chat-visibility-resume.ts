import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      'packages/react',
      'exec',
      'vitest',
      '--config',
      'vitest.config.js',
      '--run',
      'src/use-chat.ui.test.tsx',
      '-t',
      'resumes a disconnected stream when document becomes visible',
    ],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );

  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
