import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  // The workflow Vitest plugin supplies the real durable runtime and compiler.
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      'packages/workflow',
      'exec',
      'vitest',
      '--config',
      'vitest.integration.config.mjs',
      '--run',
      'src/issue-24584.integration.test.ts',
    ],
    { cwd: root, stdio: 'inherit', timeout: 120_000 },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
