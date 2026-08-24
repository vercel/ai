import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = fileURLToPath(
    new URL('../../../../', import.meta.url),
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        '-C',
        'packages/deepseek',
        'exec',
        'vitest',
        '--config',
        'vitest.node.config.js',
        '--run',
        'src/chat/issue-19377-reproduction.test.ts',
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

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
