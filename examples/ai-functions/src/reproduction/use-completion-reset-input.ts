import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        '-C',
        'packages/react',
        'exec',
        'vitest',
        '--config',
        'vitest.config.js',
        '--run',
        'src/use-completion-reset-input.reproduction.test.tsx',
      ],
      {
        cwd: repositoryRoot,
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });

  process.exitCode = exitCode;
}

main();
