import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  // Run the real Codex bridge using its existing unit-test boundary doubles.
  // No provider response is fabricated: this issue concerns bridge config.
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      'packages/harness-codex',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/index.test.ts',
      '--testNamePattern',
      'issue 24472',
    ],
    { cwd: root, stdio: 'inherit', timeout: 60_000 },
  );
  if (result.error) throw result.error;
  if (result.status === null)
    throw new Error('Codex config test did not exit normally.');
  process.exitCode = result.status;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
