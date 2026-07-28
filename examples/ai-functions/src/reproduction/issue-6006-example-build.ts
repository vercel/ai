import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function run(command: string, args: string[], cwd: string) {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

async function main() {
  const repositoryRoot = fileURLToPath(
    new URL('../../../../', import.meta.url),
  );
  const exitCode = await run('pnpm', ['build', '--force'], repositoryRoot);

  if (exitCode !== 0) {
    console.error(`Repository build failed with exit code ${exitCode}.`);
    process.exitCode = exitCode;
    return;
  }

  console.log(
    'Issue #6006 was not reproduced: the repository build succeeded.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
