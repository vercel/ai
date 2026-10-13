import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function main() {
  const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

  const child = spawn(
    'pnpm',
    [
      '-C',
      `${repositoryRoot}/packages/workflow`,
      'exec',
      'vitest',
      '--config',
      'vitest.integration.config.mjs',
      '--run',
      'src/workflow-agent-telemetry.integration.test.ts',
      '--reporter=verbose',
    ],
    {
      stdio: 'inherit',
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(
      `WorkflowAgent telemetry integration test failed with exit code ${exitCode}.`,
    );
  }

  console.log(
    'WorkflowAgent telemetry reached global integrations, OpenTelemetry, and ai:telemetry.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
