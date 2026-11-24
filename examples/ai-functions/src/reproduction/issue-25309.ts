import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Replay the reduced live Claude Code capture through the real SDK bridge.
// No credentials or network access are needed for this regression replay.
async function main() {
  const child = spawn(
    'pnpm',
    [
      '-C',
      'packages/harness-claude-code',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/index.test.ts',
      '-t',
      'issue 25309',
      '--reporter=dot',
    ],
    {
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      stdio: 'inherit',
    },
  );
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
