import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const result = spawnSync(
    'pnpm',
    [
      '-C',
      'packages/harness-claude-code',
      'exec',
      'vitest',
      '--config',
      'vitest.node.config.js',
      '--run',
      'src/bridge/abort-live.reproduction.test.ts',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 120000,
      env: { ...process.env, AI_SDK_REPRODUCE_24826: '1' },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
