import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        '-C',
        'packages/harness-opencode',
        'exec',
        'vitest',
        '--config',
        'vitest.node.config.js',
        '--run',
        'src/bridge/subagent-tool-relay.reproduction.test.ts',
      ],
      {
        cwd: repositoryRoot,
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });

  process.exitCode = exitCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
