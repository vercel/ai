import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const packageDirectory = fileURLToPath(
    new URL('../../../../packages/svelte/', import.meta.url),
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'vitest', 'run', 'src/repro-22575.svelte.test.ts'],
      {
        cwd: packageDirectory,
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
