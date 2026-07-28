import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function runBuild() {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['build'],
      {
        cwd: workspaceRoot,
        env: process.env,
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('exit', exitCode => resolve(exitCode ?? 1));
  });
}

async function main() {
  const exitCode = await runBuild();

  if (exitCode !== 0) {
    throw new Error(`Issue #6006 reproduced: pnpm build exited ${exitCode}.`);
  }

  console.log(
    'Issue #6006 could not be reproduced: pnpm build completed successfully.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
