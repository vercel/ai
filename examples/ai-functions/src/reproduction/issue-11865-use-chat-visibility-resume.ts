import { spawnSync } from 'node:child_process';

async function main() {
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      '../../packages/react',
      'exec',
      'vitest',
      '--config',
      'vitest.config.js',
      '--run',
      'src/use-chat.ui.test.tsx',
      '-t',
      'resumes an interrupted stream when the document becomes visible',
    ],
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
