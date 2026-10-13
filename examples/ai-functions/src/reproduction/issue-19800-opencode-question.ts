import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  const child = spawn(
    'pnpm',
    [
      '-C',
      `${repositoryRoot}/packages/harness-opencode`,
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/issue-19800.repro.test.ts',
    ],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`Issue #19800 reproduction test exited ${exitCode}.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
