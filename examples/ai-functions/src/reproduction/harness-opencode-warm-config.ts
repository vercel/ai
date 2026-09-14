import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

async function main() {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const exitCode = await new Promise<number>((resolveExitCode, reject) => {
    const child = spawn(
      'pnpm',
      [
        '--filter',
        '@ai-sdk/harness-opencode',
        'exec',
        'vitest',
        '--config',
        'vitest.node.config.js',
        '--run',
        'src/bridge/issue-20749.reproduction.test.ts',
      ],
      {
        cwd: repositoryRoot,
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', code => resolveExitCode(code ?? 1));
  });

  process.exitCode = exitCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
