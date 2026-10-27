import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      'packages/harness',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/agent/internal/denied-tool-output.reproduction.test.ts',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
