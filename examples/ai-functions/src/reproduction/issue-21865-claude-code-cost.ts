import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const packageDirectory = fileURLToPath(
    new URL('../../../../packages/harness-claude-code/', import.meta.url),
  );
  const child = spawn(
    'pnpm',
    [
      '-C',
      packageDirectory,
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/index.test.ts',
      '-t',
      'reports the latest cumulative cost when one bridge turn receives multiple results',
    ],
    { stdio: 'inherit' },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal != null) {
        reject(new Error(`Focused reproduction exited via signal ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  process.exitCode = exitCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
