import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const reproducedSignal =
  'ISSUE #21690 REPRODUCED: ExitPlanMode failed under allow-all and the session remained read-only.';

async function main(): Promise<void> {
  const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
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
      'src/bridge/index.test.ts',
      '-t',
      'exits plan mode under allow-all',
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  if (result.status === 0) {
    console.log(
      'Issue #21690 not reproduced: ExitPlanMode succeeded under allow-all.',
    );
    return;
  }

  if (
    output.includes(
      'ExitPlanMode should succeed under allow-all so the session leaves read-only plan mode.',
    )
  ) {
    console.error(reproducedSignal);
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `INCONCLUSIVE: focused reproduction did not reach the primary assertion (exit ${result.status ?? 'unknown'}).`,
    {
      cause: result.error,
    },
  );
}

await main().catch(error => {
  console.error(error);
  if (process.exitCode == null) {
    process.exitCode = 2;
  }
});
